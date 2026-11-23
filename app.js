"use strict";

const stages = [
  { name: "Saved", color: "#94a99b" },
  { name: "Applied", color: "#82a2ce" },
  { name: "Interviewing", color: "#b296c7" },
  { name: "Offer", color: "#b1cb76" },
  { name: "Closed", color: "#cf9b82" }
];
const badgeColors = ["#dce8da", "#e4dff0", "#e9e0ce", "#dce6ef", "#efded4"];
const $ = id => document.getElementById(id);
const editor = $("editor");
const form = $("entry-form");
const fields = form.elements;
const workspaceSelect = $("workspace");
let workspace = "personal";
let view = "board";
let records = [];
let editing = null;
let lastTrigger = null;
let database;
let channel;
let loadSequence = 0;

function dayKey(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return [String(date.getFullYear()).padStart(4, "0"), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}
function shiftedDay(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return dayKey(date);
}
function formatDay(key) {
  const date = new Date(key + "T12:00:00");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric",
    ...(key.slice(0, 4) === dayKey().slice(0, 4) ? {} : { year: "numeric" }) });
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(text, className, callback) {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", callback);
  return node;
}
function validLink(value) {
  try { return ["https:", "http:"].includes(new URL(value).protocol); }
  catch { return false; }
}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("shortlist-job-tracker", 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("applications", { keyPath: ["workspace", "id"] });
      store.createIndex("workspace", "workspace");
      const examples = [
        ["Fieldnote", "Product Engineer", "Saved", null],
        ["Morrow Labs", "Frontend Developer", "Saved", null],
        ["Northstar", "Software Engineer", "Applied", 3],
        ["Forma Studio", "Web Developer", "Applied", -1],
        ["Common Thread", "Platform Engineer", "Interviewing", 0],
        ["Relay Works", "Graduate Developer", "Offer", 5],
        ["Paperplane", "UI Engineer", "Closed", null]
      ];
      examples.forEach(([company, role, stage, offset], index) => {
        store.add({ workspace: "demo", id: "example-" + index, revision: 1,
          company, role, stage, followup: offset === null ? "" : shiftedDay(offset),
          notes: "", url: "", created: Date.now() - index * 1000 });
      });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function storageWarning(message) {
  $("warning").textContent = message;
  $("warning").hidden = false;
}
async function readWorkspace() {
  const sequence = ++loadSequence;
  try {
    const rows = await new Promise((resolve, reject) => {
      const request = database.transaction("applications").objectStore("applications").index("workspace").getAll(workspace);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (sequence !== loadSequence) return;
    records = rows.sort((a, b) => b.created - a.created || a.id.localeCompare(b.id));
    $("warning").hidden = true;
    render();
  } catch {
    storageWarning("Your browser could not read this workspace. Reload the page to try again.");
  }
}
// Compare revisions inside the same write transaction to preserve edits made in another tab.
function writeChange(next, previous) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("applications", "readwrite");
    const store = transaction.objectStore("applications");
    const entry = previous || next;
    let conflict = false;
    const request = store.get([entry.workspace, entry.id]);
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== (previous?.revision ?? 0)) {
        conflict = true;
        transaction.abort();
        return;
      }
      if (next) store.put(next);
      else store.delete([entry.workspace, entry.id]);
    };
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(new Error(conflict
      ? "This application changed in another tab. Close the editor and open the latest version."
      : "Your changes could not be saved. Check your browser storage and try again."));
  });
}
function isScheduled(record) {
  return record.stage !== "Closed" && Boolean(record.followup);
}
function dateTag(record) {
  const key = record.followup;
  const today = dayKey();
  const label = key === today ? "Due today" : key < today ? "Overdue · " + formatDay(key) : "Follow up · " + formatDay(key);
  return element("span", "date-tag" + (key <= today ? " late" : ""), label);
}
function monogram(company) {
  const words = company.trim().split(/\s+/);
  const letters = (Array.from(words[0])[0] || "") + (words.length > 1 ? Array.from(words[words.length - 1])[0] : "");
  const badge = element("span", "monogram", letters.toLocaleUpperCase());
  const hash = Array.from(company).reduce((value, letter) => value + letter.codePointAt(0), 0);
  badge.style.backgroundColor = badgeColors[hash % badgeColors.length];
  badge.setAttribute("aria-hidden", "true");
  return badge;
}
function makeCard(record) {
  const button = action("", "card", () => edit(record));
  button.setAttribute("aria-label", "Edit " + record.role + " at " + record.company);
  const top = element("span", "card-top");
  top.append(monogram(record.company), element("span", "", record.company));
  button.append(top, element("strong", "", record.role));
  if (isScheduled(record)) button.append(dateTag(record));
  return button;
}
function emptyPanel(title, hint, buttons = []) {
  const panel = element("div", "empty");
  panel.append(element("h3", "", title), element("p", "", hint));
  if (buttons.length) {
    const actions = element("div", "empty-actions");
    actions.append(...buttons);
    panel.append(actions);
  }
  return panel;
}
function renderBoard(visible, searching) {
  const container = $("content");
  if (!records.length && !searching) {
    const buttons = [action("Add first application", "primary", () => edit())];
    if (workspace === "personal") buttons.push(action("Try the demo board", "text-btn", () => switchWorkspace("demo")));
    container.append(emptyPanel("Save your first opening", "Add a company and job title to start tracking a role. You can set a follow-up when you know your next step.", buttons));
  }
  const board = element("div", "board" + (visible.length ? "" : " blank"));
  for (const stage of stages) {
    const items = visible.filter(record => record.stage === stage.name);
    const lane = element("section", "lane");
    lane.style.setProperty("--tone", stage.color);
    const header = element("div", "lane-head");
    const add = action("+", "lane-add", () => edit(null, stage.name));
    add.setAttribute("aria-label", "Add application in " + stage.name);
    header.append(element("span", "stage-dot"), element("h3", "", stage.name), element("span", "count", items.length), add);
    lane.append(header, ...items.map(makeCard));
    if (!items.length && visible.length) lane.append(element("p", "lane-empty", "No roles here"));
    board.append(lane);
  }
  container.append(board);
}
function renderFollowups(visible, searching) {
  const pending = visible.filter(isScheduled).sort((a, b) => a.followup.localeCompare(b.followup) || a.company.localeCompare(b.company));
  if (!pending.length) {
    $("content").append(emptyPanel(searching ? "No matching follow-ups" : "No follow-ups scheduled",
      searching ? "Try a different company or job title." : "Set a follow-up date on an application to see it here.",
      [action(searching ? "Clear search" : "View board", "text-btn", searching ? clearSearch : () => changeView("board"))]));
    return;
  }
  const list = element("div", "follow-list");
  const today = dayKey();
  let previousGroup = "";
  for (const record of pending) {
    const group = record.followup < today ? "Overdue" : record.followup === today ? "Today" : "Upcoming";
    if (group !== previousGroup) {
      list.append(element("h3", "group-title", group));
      previousGroup = group;
    }
    const row = action("", "follow-row", () => edit(record));
    const info = element("span", "role-info");
    info.append(element("strong", "", record.role), element("small", "", record.company + " · " + record.stage));
    row.append(monogram(record.company), info, dateTag(record));
    list.append(row);
  }
  $("content").append(list);
}
function render() {
  const counts = stages.map(stage => records.filter(record => record.stage === stage.name).length);
  $("total").textContent = records.length;
  $("interviews").textContent = counts[2];
  $("due").textContent = records.filter(record => isScheduled(record) && record.followup <= dayKey()).length;
  $("mix").replaceChildren();
  counts.forEach((count, index) => {
    if (!count) return;
    const segment = element("i");
    segment.style.flex = String(count);
    segment.style.backgroundColor = stages[index].color;
    $("mix").append(segment);
  });
  const isBoard = view === "board";
  $("title").textContent = isBoard ? "Application board" : "Follow-ups";
  $("subtitle").textContent = isBoard ? "Your roles and next steps, from first save to offer." : "Keep track of who to contact and when.";
  $("section-title").textContent = isBoard ? "Hiring pipeline" : "Follow-up schedule";
  for (const tab of document.querySelectorAll("[data-view]")) {
    if (tab.dataset.view === view) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  workspaceSelect.value = workspace;
  $("demo-note").hidden = workspace !== "demo";
  $("demo-toggle").textContent = workspace === "personal" ? "Explore demo board" : "Open my workspace";
  const term = $("search").value.trim().toLocaleLowerCase();
  const visible = records.filter(record => [record.company, record.role].some(value => value.toLocaleLowerCase().includes(term)));
  $("content").replaceChildren();
  if (isBoard && term && !visible.length) {
    $("content").append(emptyPanel("No matching roles", "Try a different company or job title.", [action("Clear search", "text-btn", clearSearch)]));
  } else if (isBoard) renderBoard(visible, Boolean(term));
  else renderFollowups(visible, Boolean(term));
}
function clearSearch() {
  $("search").value = "";
  render();
  $("search").focus();
}
function changeView(next) {
  view = next;
  $("search").value = "";
  render();
}
async function switchWorkspace(next) {
  if (next === workspace) return;
  workspace = next;
  records = [];
  view = "board";
  $("search").value = "";
  render();
  await readWorkspace();
}
function showFormError(message) {
  $("form-error").textContent = message;
  $("form-error").hidden = false;
}
function updatePostingLink() {
  const value = fields.url.value.trim();
  const valid = validLink(value);
  const link = $("open-posting");
  link.hidden = !valid;
  if (valid) link.href = value;
  else link.removeAttribute("href");
  fields.url.setCustomValidity(value && !valid ? "Enter an http or https URL." : "");
}
function edit(record = null, stage = "Saved") {
  if (!database) return;
  lastTrigger = document.activeElement;
  editing = record;
  form.reset();
  for (const field of ["company", "role", "followup", "url", "notes"]) {
    fields[field].value = record?.[field] || "";
    fields[field].setCustomValidity("");
  }
  fields.stage.value = record?.stage || stage;
  $("editor-title").textContent = record ? "Edit application" : "Add application";
  $("remove").hidden = !record;
  $("form-error").hidden = true;
  updatePostingLink();
  editor.showModal();
  fields.company.focus();
}
async function persist(next, message) {
  const previous = editing;
  try { await writeChange(next, previous); }
  catch (error) {
    showFormError(error.message);
    await readWorkspace();
    return;
  }
  editor.close();
  await readWorkspace();
  channel?.postMessage("changed");
  $("announcement").textContent = message;
  if (!lastTrigger?.isConnected) $("add").focus();
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  for (const name of ["company", "role"]) {
    fields[name].setCustomValidity(fields[name].value.trim() ? "" : "Enter a " + (name === "role" ? "job title." : "company name."));
  }
  updatePostingLink();
  if (!form.reportValidity()) return;
  const data = Object.fromEntries(new FormData(form));
  const next = { ...data, company: data.company.trim(), role: data.role.trim(), url: data.url.trim(), notes: data.notes.trim(),
    workspace, id: editing?.id || crypto.randomUUID(), created: editing?.created || Date.now(), revision: (editing?.revision || 0) + 1 };
  const submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  try { await persist(next, "Application saved."); }
  finally { submit.disabled = false; }
});
for (const name of ["company", "role"]) fields[name].addEventListener("input", () => fields[name].setCustomValidity(""));
fields.url.addEventListener("input", updatePostingLink);
$("cancel").onclick = $("close").onclick = () => editor.close();
$("remove").onclick = () => {
  $("delete-description").textContent = "Remove " + editing.role + " at " + editing.company + " from this workspace?";
  $("confirm-delete").showModal();
  $("keep").focus();
};
$("keep").onclick = () => $("confirm-delete").close();
$("confirm").onclick = async () => {
  $("confirm-delete").close();
  await persist(null, "Application deleted.");
};
$("add").onclick = () => edit();
$("use-own").onclick = () => switchWorkspace("personal");
$("demo-toggle").onclick = () => switchWorkspace(workspace === "personal" ? "demo" : "personal");
workspaceSelect.onchange = () => switchWorkspace(workspaceSelect.value);
$("search").oninput = render;
for (const tab of document.querySelectorAll("[data-view]")) tab.onclick = () => changeView(tab.dataset.view);
for (const stage of stages) fields.stage.add(new Option(stage.name, stage.name));
async function start() {
  try {
    database = await openDatabase();
    database.onversionchange = () => { database.close(); location.reload(); };
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("shortlist-updates");
      channel.onmessage = readWorkspace;
    }
    window.addEventListener("focus", readWorkspace);
    await readWorkspace();
  } catch {
    $("add").disabled = workspaceSelect.disabled = $("demo-toggle").disabled = true;
    storageWarning("Browser storage is unavailable. Open this page in a browser that allows IndexedDB to save your applications.");
  }
}
start();
