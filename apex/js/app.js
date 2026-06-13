import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDT7hIbXv2tBQbuWnXnqSFcmsujrDAe_Z0",
  authDomain: "apex-83502.firebaseapp.com",
  projectId: "apex-83502",
  storageBucket: "apex-83502.firebasestorage.app",
  messagingSenderId: "1014117686331",
  appId: "1:1014117686331:web:07c8a2294e9d032dde101e",
  measurementId: "G-C0NCGDXB8J"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const DEALERSHIP = "porsche-south-orlando";
let currentUser = null;
let currentRole = null;
let activeRunId = null;
let selectedRole = null;
let unsubscribers = [];

function unsub() { unsubscribers.forEach(fn => fn()); unsubscribers = []; }

// AUTH STATE
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const userDoc = await getDoc(doc(db, "dealerships", DEALERSHIP, "users", user.uid));
    if (!userDoc.exists()) {
      showPending(); return;
    }
    const userData = userDoc.data();
    if (userData.status === "pending") { showPending(); return; }
    currentRole = userData.role;
    launchApp(user, userData);
  } else {
    currentUser = null; currentRole = null;
    unsub();
    showAuth();
  }
});

function showAuth() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("pending-form").style.display = "none";
  document.getElementById("login-form").style.display = "block";
  document.getElementById("register-form").style.display = "none";
}

function showPending() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("login-form").style.display = "none";
  document.getElementById("register-form").style.display = "none";
  document.getElementById("pending-form").style.display = "block";
}

function launchApp(user, userData) {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  const name = userData.name || user.email.split("@")[0];
  document.getElementById("header-name").textContent = name;
  document.getElementById("header-av").textContent = name.charAt(0).toUpperCase();
  document.getElementById("header-date").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const roleLabel = { porter: "Porter", advisor: "Service Advisor", manager: "Service Manager" };
  const roleClass = { porter: "rb-porter", advisor: "rb-advisor", manager: "rb-manager" };
  document.getElementById("header-role-label").innerHTML = `<span class="role-badge ${roleClass[currentRole] || 'rb-porter'}">${roleLabel[currentRole] || currentRole}</span>`;
  applyRoleUI(currentRole);
  startListeners();
}

function applyRoleUI(role) {
  // Show/hide nav tabs by role
  document.querySelectorAll(".advisor-only").forEach(el => el.style.display = (role === "advisor" || role === "manager") ? "block" : "none");
  document.querySelectorAll(".manager-only").forEach(el => el.style.display = role === "manager" ? "block" : "none");
  // Hide status buttons for advisors/managers (they don't need to set porter status)
  if (role === "advisor" || role === "manager") {
    document.getElementById("my-status-section").style.display = "none";
  }
}

function startListeners() {
  // Porters (approved only)
  const portersRef = collection(db, "dealerships", DEALERSHIP, "users");
  const u1 = onSnapshot(portersRef, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const approved = all.filter(u => u.status === "approved");
    const porters = approved.filter(u => u.role === "porter");
    renderPorters(porters);
    updateStats(porters);
    populatePorterSelect(porters);
    if (currentRole === "manager") {
      renderAdminUsers(approved);
      renderPendingUsers(all.filter(u => u.status === "pending"));
    }
  });

  // Runs
  const runsRef = query(collection(db, "dealerships", DEALERSHIP, "runs"), orderBy("createdAt", "desc"));
  const u2 = onSnapshot(runsRef, snap => {
    const runs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRuns(runs);
    renderMapRuns(runs);
  });

  // Messages
  const msgsRef = query(collection(db, "dealerships", DEALERSHIP, "messages"), orderBy("createdAt", "asc"));
  const u3 = onSnapshot(msgsRef, snap => {
    renderMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });

  unsubscribers.push(u1, u2, u3);
}

const avatarClasses = ["pav-b", "pav-g", "pav-s", "pav-j", "pav-default"];
const statusClass = { available: "p-avail", enroute: "p-enroute", returning: "p-return", busy: "p-busy", lunch: "p-lunch" };
const statusLabel = { available: "Available", enroute: "En route", returning: "Returning", busy: "On lot", lunch: "Lunch" };

function renderPorters(porters) {
  const list = document.getElementById("porter-list");
  if (!porters.length) { list.innerHTML = `<div class="empty-state"><i class="ti ti-users"></i><p>No porters yet</p></div>`; return; }
  list.innerHTML = porters.map((p, i) => {
    const initials = (p.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const isMe = p.id === currentUser?.uid;
    const avClass = isMe ? "pav-z" : avatarClasses[i % avatarClasses.length];
    const sc = statusClass[p.status] || "p-busy";
    const sl = statusLabel[p.status] || p.status;
    return `<div class="porter-row">
      <div class="pav ${avClass}">${initials}</div>
      <div class="pinfo">
        <div class="pname">${p.name}${isMe ? " · You" : ""}</div>
        <div class="pdetail">${p.detail || "At dealership"}</div>
      </div>
      <span class="pill ${sc}">${sl}</span>
    </div>`;
  }).join("");

  // Highlight active status button
  if (currentRole === "porter") {
    const me = porters.find(p => p.id === currentUser?.uid);
    if (me) highlightStatusBtn(me.status);
  }
}

function highlightStatusBtn(status) {
  document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active-status"));
  const map = { available: "s-btn-avail", enroute: "s-btn-enroute", returning: "s-btn-return", busy: "s-btn-busy", lunch: "s-btn-lunch" };
  const cls = map[status];
  if (cls) document.querySelector("." + cls)?.classList.add("active-status");
}

function updateStats(porters) {
  document.getElementById("sn-porters").textContent = porters.length;
  document.getElementById("sn-available").textContent = porters.filter(p => p.status === "available").length;
}

function populatePorterSelect(porters) {
  const sel = document.getElementById("inp-porter");
  const cur = sel.value;
  sel.innerHTML = `<option value="">Unassigned</option>` + porters.map(p => `<option value="${p.name}">${p.name}</option>`).join("");
  if (cur) sel.value = cur;
}

function renderRuns(runs) {
  const active = runs.filter(r => r.status !== "complete");
  document.getElementById("sn-active").textContent = active.length;
  const list = document.getElementById("run-list");
  if (!active.length) { list.innerHTML = `<div class="empty-state"><i class="ti ti-car"></i><p>No active runs</p></div>`; return; }
  list.innerHTML = active.map(r => {
    const sc = r.porter && r.porter !== "Unassigned" ? "p-enroute" : "p-unassign";
    const sl = r.porter && r.porter !== "Unassigned" ? "Active" : "Unassigned";
    return `<div class="run-card" onclick="window.openRun('${r.id}')">
      <div class="run-top">
        <div>
          <div class="run-name">${r.customer} <span class="run-id">${r.runId || ""}</span></div>
          <div class="run-car">${r.car || "—"}</div>
        </div>
        <span class="pill ${sc}">${sl}</span>
      </div>
      <div class="run-addr"><i class="ti ti-map-pin" style="font-size:12px"></i>${r.address || "—"}</div>
      <div class="run-footer">
        <div class="run-meta"><i class="ti ti-user" style="font-size:12px"></i>${r.porter || "Unassigned"}</div>
        <div class="run-meta"><i class="ti ti-headset" style="font-size:12px"></i>${r.advisor || "—"}</div>
        <div class="run-meta"><i class="ti ti-tag" style="font-size:12px"></i>${r.type || "—"}</div>
      </div>
    </div>`;
  }).join("");
}

const mapPositions = [{x:75,y:55},{x:265,y:55},{x:195,y:165},{x:60,y:155},{x:290,y:145}];

function renderMapRuns(runs) {
  const active = runs.filter(r => r.status !== "complete");
  const pinsG = document.getElementById("map-run-pins");
  if (pinsG) pinsG.innerHTML = active.slice(0, 5).map((r, i) => {
    const pos = mapPositions[i] || mapPositions[0];
    const color = r.porter && r.porter !== "Unassigned" ? "#4a9" : "#6ab";
    return `<line x1="176" y1="105" x2="${pos.x}" y2="${pos.y}" stroke="${color}44" stroke-width="1" stroke-dasharray="4,3"/>
    <circle cx="${pos.x}" cy="${pos.y}" r="7" fill="#1a2820" stroke="${color}" stroke-width="1"/>
    <text x="${pos.x}" y="${pos.y+4}" text-anchor="middle" font-size="7" fill="${color}" font-family="sans-serif">${r.runId||"R"}</text>
    <text x="${pos.x}" y="${pos.y-12}" text-anchor="middle" font-size="9" fill="${color}" font-family="sans-serif">${r.porter&&r.porter!=="Unassigned"?r.porter.split(" ")[0]:""}</text>`;
  }).join("");
  const mapList = document.getElementById("map-run-list");
  if (!active.length) { if(mapList) mapList.innerHTML = `<div class="empty-state"><i class="ti ti-map-pin"></i><p>No active runs</p></div>`; return; }
  if (mapList) mapList.innerHTML = active.map(r => `
    <div class="run-card" onclick="window.openRun('${r.id}')">
      <div class="run-top">
        <div><div class="run-name">${r.customer} <span class="run-id">${r.runId||""}</span></div><div class="run-car">${r.car||"—"}</div></div>
        <span class="pill ${r.porter&&r.porter!=="Unassigned"?"p-enroute":"p-unassign"}">${r.porter||"Unassigned"}</span>
      </div>
      <div class="run-addr"><i class="ti ti-map-pin" style="font-size:12px"></i>${r.address||"—"}</div>
    </div>`).join("");
  const nb = document.getElementById("nearby-banner");
  if (nb) nb.style.display = active.length >= 2 ? "flex" : "none";
}

function renderMessages(msgs) {
  const thread = document.getElementById("comms-thread");
  if (!msgs.length) { thread.innerHTML = `<div class="empty-state" style="padding:16px;"><i class="ti ti-message"></i><p>No messages yet</p></div>`; return; }
  thread.innerHTML = msgs.map(m => {
    const mine = m.uid === currentUser?.uid;
    const time = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}) : "just now";
    return `<div class="msg-wrap ${mine?"mine":""}">
      <div class="msg-bubble ${mine?"msg-mine":"msg-theirs"}">${m.text}</div>
      <div class="msg-sender">${mine?"You":m.senderName} · ${time}</div>
    </div>`;
  }).join("");
  thread.scrollTop = thread.scrollHeight;
}

function renderPendingUsers(pending) {
  const list = document.getElementById("pending-list");
  if (!list) return;
  if (!pending.length) { list.innerHTML = `<div class="empty-state"><i class="ti ti-user-check"></i><p>No pending accounts</p></div>`; return; }
  list.innerHTML = pending.map(u => `
    <div class="admin-card">
      <div class="admin-card-top">
        <div>
          <div class="admin-name">${u.name || "—"}</div>
          <div class="admin-email">${u.email || "—"} · Requested: ${u.requestedRole || "porter"}</div>
        </div>
        <span class="pill p-pending">Pending</span>
      </div>
      <div class="admin-actions">
        <select class="role-select" id="role-sel-${u.id}">
          <option value="porter" ${u.requestedRole==="porter"?"selected":""}>Porter</option>
          <option value="advisor" ${u.requestedRole==="advisor"?"selected":""}>Advisor</option>
          <option value="manager" ${u.requestedRole==="manager"?"selected":""}>Manager</option>
        </select>
        <button class="btn-approve" onclick="window.approveUser('${u.id}')"><i class="ti ti-check"></i> Approve</button>
        <button class="btn-remove" onclick="window.denyUser('${u.id}')">Deny</button>
      </div>
    </div>`).join("");
}

function renderAdminUsers(users) {
  const list = document.getElementById("admin-user-list");
  if (!list) return;
  list.innerHTML = users.map(u => `
    <div class="admin-card">
      <div class="admin-card-top">
        <div>
          <div class="admin-name">${u.name || "—"} ${u.id===currentUser?.uid?"· You":""}</div>
          <div class="admin-email">${u.email || "—"}</div>
        </div>
        <span class="pill ${u.role==="manager"?"p-lunch":u.role==="advisor"?"p-avail":"p-enroute'}">${u.role||"porter"}</span>
      </div>
      ${u.id !== currentUser?.uid ? `<div class="admin-actions">
        <select class="role-select" id="change-role-${u.id}" onchange="window.changeRole('${u.id}', this.value)">
          <option value="porter" ${u.role==="porter"?"selected":""}>Porter</option>
          <option value="advisor" ${u.role==="advisor"?"selected":""}>Advisor</option>
          <option value="manager" ${u.role==="manager"?"selected":""}>Manager</option>
        </select>
        <button class="btn-remove" onclick="window.removeUser('${u.id}')">Remove</button>
      </div>` : ""}
    </div>`).join("");
}

// GLOBAL FUNCTIONS
window.showTab = (id, el) => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(t => t.classList.remove("active"));
  document.getElementById("page-" + id).classList.add("active");
  el.classList.add("active");
};

window.selectRole = (role) => {
  selectedRole = role;
  document.querySelectorAll(".role-option").forEach(el => el.classList.remove("selected"));
  document.getElementById("role-" + role)?.classList.add("selected");
};

window.toggleForm = (form) => {
  document.getElementById("auth-error").style.display = "none";
  document.getElementById("login-form").style.display = form === "login" ? "block" : "none";
  document.getElementById("register-form").style.display = form === "register" ? "block" : "none";
};

window.setMyStatus = async (status, detail) => {
  if (!currentUser || currentRole !== "porter") return;
  const ref = doc(db, "dealerships", DEALERSHIP, "users", currentUser.uid);
  await updateDoc(ref, { status, detail });
};

window.openRun = async (id) => {
  const snap = await getDoc(doc(db, "dealerships", DEALERSHIP, "runs", id));
  if (!snap.exists()) return;
  const r = { id: snap.id, ...snap.data() };
  activeRunId = id;
  document.getElementById("m-title").textContent = r.customer;
  document.getElementById("m-sub").textContent = (r.car || "—") + " · " + (r.runId || "");
  document.getElementById("m-addr").textContent = r.address || "—";
  document.getElementById("m-porter").textContent = r.porter || "Unassigned";
  document.getElementById("m-advisor").textContent = r.advisor || "—";
  document.getElementById("m-type").textContent = r.type || "—";
  document.getElementById("nav-confirm").style.display = "none";
  document.getElementById("run-modal").style.display = "flex";
};

window.closeModal = () => { document.getElementById("run-modal").style.display = "none"; activeRunId = null; };

window.openNav = async () => {
  if (!activeRunId) return;
  const snap = await getDoc(doc(db, "dealerships", DEALERSHIP, "runs", activeRunId));
  if (!snap.exists()) return;
  const r = snap.data();
  document.getElementById("nav-confirm").style.display = "block";
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "runs", activeRunId), { status: "enroute" });
  if (currentRole === "porter") {
    await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", currentUser.uid), {
      status: "enroute", detail: `En route · ${r.type} · ${(r.address||"").split(",")[0]}`
    });
  }
  setTimeout(() => {
    const addr = encodeURIComponent(r.address || "");
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS ? "maps://?q=" + addr : "https://maps.google.com/?q=" + addr;
    window.open(url, "_blank");
  }, 600);
};

window.completeRun = async () => {
  if (!activeRunId) return;
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "runs", activeRunId), { status: "complete", completedAt: serverTimestamp() });
  if (currentRole === "porter") {
    await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", currentUser.uid), { status: "available", detail: "Available · Just completed a run" });
  }
  closeModal();
};

window.sendTeamMessage = async () => {
  const input = document.getElementById("comms-msg");
  const text = input.value.trim();
  if (!text || !currentUser) return;
  input.value = "";
  await addDoc(collection(db, "dealerships", DEALERSHIP, "messages"), { text, uid: currentUser.uid, senderName: currentUser.displayName || currentUser.email.split("@")[0], createdAt: serverTimestamp() });
};

window.sendQuickMsg = async (text) => {
  if (!currentUser) return;
  await addDoc(collection(db, "dealerships", DEALERSHIP, "messages"), { text, uid: currentUser.uid, senderName: currentUser.displayName || currentUser.email.split("@")[0], createdAt: serverTimestamp() });
};

let runCounter = 44;
window.createRun = async () => {
  const name = document.getElementById("inp-name").value.trim();
  const addr = document.getElementById("inp-addr").value.trim();
  if (!name || !addr) { alert("Customer name and address are required."); return; }
  runCounter++;
  await addDoc(collection(db, "dealerships", DEALERSHIP, "runs"), {
    runId: `R-0${runCounter}`,
    customer: name,
    car: document.getElementById("inp-car").value.trim() || "—",
    address: addr,
    porter: document.getElementById("inp-porter").value || "Unassigned",
    advisor: document.getElementById("inp-advisor").value.trim() || "—",
    type: document.getElementById("inp-type").value,
    status: "active",
    createdAt: serverTimestamp(),
    createdBy: currentUser?.displayName || currentUser?.email
  });
  ["inp-name","inp-car","inp-addr","inp-advisor"].forEach(id => document.getElementById(id).value = "");
  const confirm = document.getElementById("run-confirm");
  confirm.style.display = "block";
  setTimeout(() => confirm.style.display = "none", 2500);
};

window.approveUser = async (uid) => {
  const roleSel = document.getElementById("role-sel-" + uid);
  const role = roleSel ? roleSel.value : "porter";
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", uid), { status: "approved", role });
};

window.denyUser = async (uid) => {
  if (confirm("Remove this account request?")) {
    await deleteDoc(doc(db, "dealerships", DEALERSHIP, "users", uid));
  }
};

window.changeRole = async (uid, role) => {
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", uid), { role });
};

window.removeUser = async (uid) => {
  if (confirm("Remove this team member?")) {
    await deleteDoc(doc(db, "dealerships", DEALERSHIP, "users", uid));
  }
};

window.handleLogin = async () => {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const btn = document.getElementById("login-btn");
  const err = document.getElementById("auth-error");
  err.style.display = "none";
  btn.textContent = "Signing in…"; btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    err.textContent = friendlyError(e.code); err.style.display = "block";
    btn.textContent = "Sign in"; btn.disabled = false;
  }
};

window.handleRegister = async () => {
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const err = document.getElementById("auth-error");
  err.style.display = "none";
  if (!name) { err.textContent = "Please enter your name."; err.style.display = "block"; return; }
  if (!email) { err.textContent = "Please enter your email."; err.style.display = "block"; return; }
  if (password.length < 6) { err.textContent = "Password must be at least 6 characters."; err.style.display = "block"; return; }
  if (!selectedRole) { err.textContent = "Please select your role."; err.style.display = "block"; return; }
  const btn = document.getElementById("register-btn");
  btn.textContent = "Requesting access…"; btn.disabled = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "dealerships", DEALERSHIP, "users", cred.user.uid), {
      name, email, role: selectedRole, requestedRole: selectedRole,
      status: "pending", uid: cred.user.uid, createdAt: serverTimestamp()
    });
    await signOut(auth);
    showPending();
  } catch (e) {
    err.textContent = friendlyError(e.code); err.style.display = "block";
    btn.textContent = "Request access"; btn.disabled = false;
  }
};

window.handleSignOut = async () => { unsub(); await signOut(auth); };

function friendlyError(code) {
  const map = {
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Try again later."
  };
  return map[code] || "Something went wrong. Please try again.";
}
