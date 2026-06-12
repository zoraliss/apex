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

let currentUser = null;
let activeRunId = null;
let unsubscribers = [];

const DEALERSHIP = "porsche-south-orlando";

function unsub() { unsubscribers.forEach(fn => fn()); unsubscribers = []; }

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-screen").style.display = "block";
    const name = user.displayName || user.email.split("@")[0];
    document.getElementById("header-name").textContent = name;
    document.getElementById("header-av").textContent = name.charAt(0).toUpperCase();
    document.getElementById("header-date").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    await ensurePorterDoc(user);
    startListeners();
  } else {
    currentUser = null;
    unsub();
    document.getElementById("auth-screen").style.display = "flex";
    document.getElementById("app-screen").style.display = "none";
  }
});

async function ensurePorterDoc(user) {
  const ref = doc(db, "dealerships", DEALERSHIP, "porters", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const name = user.displayName || user.email.split("@")[0];
    await setDoc(ref, { name, email: user.email, status: "available", detail: "At dealership", uid: user.uid, createdAt: serverTimestamp() });
  }
}

function startListeners() {
  const portersRef = collection(db, "dealerships", DEALERSHIP, "porters");
  const u1 = onSnapshot(portersRef, snap => {
    const porters = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPorters(porters);
    updateStats(porters);
    populatePorterSelect(porters);
  });

  const runsRef = query(collection(db, "dealerships", DEALERSHIP, "runs"), orderBy("createdAt", "desc"));
  const u2 = onSnapshot(runsRef, snap => {
    const runs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRuns(runs);
    renderMapRuns(runs);
  });

  const msgsRef = query(collection(db, "dealerships", DEALERSHIP, "messages"), orderBy("createdAt", "asc"));
  const u3 = onSnapshot(msgsRef, snap => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages(msgs);
  });

  unsubscribers.push(u1, u2, u3);
}

const avatarColors = ["pav-z", "pav-b", "pav-g", "pav-s", "pav-j"];
const statusClass = { available: "p-avail", enroute: "p-enroute", returning: "p-return", busy: "p-busy" };
const statusLabel = { available: "Available", enroute: "En route", returning: "Returning", busy: "On lot" };

function renderPorters(porters) {
  const list = document.getElementById("porter-list");
  if (!porters.length) { list.innerHTML = `<div class="empty-state"><i class="ti ti-users"></i><p>No porters yet</p></div>`; return; }
  list.innerHTML = porters.map((p, i) => {
    const initials = p.name ? p.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() : "?";
    const avClass = p.uid === currentUser?.uid ? "pav-z" : avatarColors[(i % (avatarColors.length - 1)) + 1];
    const sc = statusClass[p.status] || "p-busy";
    const sl = statusLabel[p.status] || p.status;
    const isMe = p.uid === currentUser?.uid ? " · You" : "";
    return `<div class="porter-row">
      <div class="pav ${avClass}">${initials}</div>
      <div class="pinfo">
        <div class="pname">${p.name}${isMe}</div>
        <div class="pdetail">${p.detail || "—"}</div>
      </div>
      <span class="pill ${sc}">${sl}</span>
    </div>`;
  }).join("");
}

function updateStats(porters) {
  document.getElementById("sn-porters").textContent = porters.length;
  document.getElementById("sn-available").textContent = porters.filter(p => p.status === "available").length;
}

function populatePorterSelect(porters) {
  const sel = document.getElementById("inp-porter");
  const current = sel.value;
  sel.innerHTML = `<option value="">Unassigned</option>` + porters.map(p => `<option value="${p.name}">${p.name}</option>`).join("");
  if (current) sel.value = current;
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

const mapPositions = [
  { x: 75, y: 55 }, { x: 265, y: 55 }, { x: 195, y: 165 },
  { x: 60, y: 155 }, { x: 290, y: 145 }
];

function renderMapRuns(runs) {
  const active = runs.filter(r => r.status !== "complete");
  const pinsG = document.getElementById("map-run-pins");
  if (!pinsG) return;
  pinsG.innerHTML = active.slice(0, 5).map((r, i) => {
    const pos = mapPositions[i] || mapPositions[0];
    const color = r.porter && r.porter !== "Unassigned" ? "#4a9" : "#6ab";
    const label = r.runId || `R${i+1}`;
    return `<line x1="176" y1="105" x2="${pos.x}" y2="${pos.y}" stroke="${color}44" stroke-width="1" stroke-dasharray="4,3"/>
    <circle cx="${pos.x}" cy="${pos.y}" r="7" fill="#1a2820" stroke="${color}" stroke-width="1"/>
    <text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" font-size="7" fill="${color}" font-family="sans-serif">${label}</text>
    <text x="${pos.x}" y="${pos.y - 12}" text-anchor="middle" font-size="9" fill="${color}" font-family="sans-serif">${r.porter !== "Unassigned" ? r.porter?.split(" ")[0] : ""}</text>`;
  }).join("");

  const mapList = document.getElementById("map-run-list");
  if (!active.length) { mapList.innerHTML = `<div class="empty-state"><i class="ti ti-map-pin"></i><p>No active runs</p></div>`; return; }
  mapList.innerHTML = active.map(r => `
    <div class="run-card" onclick="window.openRun('${r.id}')">
      <div class="run-top">
        <div><div class="run-name">${r.customer} <span class="run-id">${r.runId || ""}</span></div><div class="run-car">${r.car || "—"}</div></div>
        <span class="pill ${r.porter && r.porter !== 'Unassigned' ? 'p-enroute' : 'p-unassign'}">${r.porter || "Unassigned"}</span>
      </div>
      <div class="run-addr"><i class="ti ti-map-pin" style="font-size:12px"></i>${r.address || "—"}</div>
    </div>`).join("");

  document.getElementById("nearby-banner").style.display = active.length >= 2 ? "flex" : "none";
  if (active.length >= 2) document.getElementById("nearby-txt").textContent = `${active[0].runId} and ${active[1]?.runId} are nearby — consider combining`;
}

function renderMessages(msgs) {
  const thread = document.getElementById("comms-thread");
  if (!msgs.length) { thread.innerHTML = `<div class="empty-state" style="padding:16px;"><i class="ti ti-message"></i><p>No messages yet</p></div>`; return; }
  thread.innerHTML = msgs.map(m => {
    const mine = m.uid === currentUser?.uid;
    return `<div class="msg-wrap ${mine ? "mine" : ""}">
      <div class="msg-bubble ${mine ? "msg-mine" : "msg-theirs"}">${m.text}</div>
      <div class="msg-sender">${mine ? "You" : m.senderName} · ${m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "just now"}</div>
    </div>`;
  }).join("");
  thread.scrollTop = thread.scrollHeight;
}

window.showTab = (id, el) => {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(t => t.classList.remove("active"));
  document.getElementById("page-" + id).classList.add("active");
  el.classList.add("active");
};

window.setMyStatus = async (status) => {
  if (!currentUser) return;
  const details = { available: "At dealership", enroute: "En route to pickup", returning: "Returning to dealership", busy: "On lot" };
  const ref = doc(db, "dealerships", DEALERSHIP, "porters", currentUser.uid);
  await updateDoc(ref, { status, detail: details[status] });
};

window.openRun = async (id) => {
  const ref = doc(db, "dealerships", DEALERSHIP, "runs", id);
  const snap = await getDoc(ref);
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

window.closeModal = () => {
  document.getElementById("run-modal").style.display = "none";
  activeRunId = null;
};

window.openNav = async () => {
  if (!activeRunId) return;
  const ref = doc(db, "dealerships", DEALERSHIP, "runs", activeRunId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const r = snap.data();
  document.getElementById("nav-confirm").style.display = "block";
  await updateDoc(ref, { status: "enroute", porterStarted: currentUser?.displayName || currentUser?.email });
  if (currentUser) {
    const pRef = doc(db, "dealerships", DEALERSHIP, "porters", currentUser.uid);
    await updateDoc(pRef, { status: "enroute", detail: `En route · ${r.type} · ${r.address?.split(",")[0]}` });
  }
  setTimeout(() => {
    const encoded = encodeURIComponent(r.address || "");
    window.open("https://maps.google.com/?q=" + encoded, "_blank");
  }, 600);
};

window.completeRun = async () => {
  if (!activeRunId) return;
  const ref = doc(db, "dealerships", DEALERSHIP, "runs", activeRunId);
  await updateDoc(ref, { status: "complete", completedAt: serverTimestamp() });
  if (currentUser) {
    const pRef = doc(db, "dealerships", DEALERSHIP, "porters", currentUser.uid);
    await updateDoc(pRef, { status: "available", detail: "Available · Just completed a run" });
  }
  closeModal();
};

window.sendTeamMessage = async () => {
  const input = document.getElementById("comms-msg");
  const text = input.value.trim();
  if (!text || !currentUser) return;
  input.value = "";
  await addDoc(collection(db, "dealerships", DEALERSHIP, "messages"), {
    text,
    uid: currentUser.uid,
    senderName: currentUser.displayName || currentUser.email.split("@")[0],
    createdAt: serverTimestamp()
  });
};

window.sendQuickMsg = async (text) => {
  if (!currentUser) return;
  await addDoc(collection(db, "dealerships", DEALERSHIP, "messages"), {
    text,
    uid: currentUser.uid,
    senderName: currentUser.displayName || currentUser.email.split("@")[0],
    createdAt: serverTimestamp()
  });
};

let runCounter = 44;
window.createRun = async () => {
  const name = document.getElementById("inp-name").value.trim();
  const car = document.getElementById("inp-car").value.trim();
  const addr = document.getElementById("inp-addr").value.trim();
  const porter = document.getElementById("inp-porter").value;
  const advisor = document.getElementById("inp-advisor").value.trim();
  const type = document.getElementById("inp-type").value;
  if (!name || !addr) { alert("Customer name and address are required."); return; }
  runCounter++;
  await addDoc(collection(db, "dealerships", DEALERSHIP, "runs"), {
    runId: `R-0${runCounter}`,
    customer: name,
    car: car || "—",
    address: addr,
    porter: porter || "Unassigned",
    advisor: advisor || "—",
    type,
    status: "active",
    createdAt: serverTimestamp(),
    createdBy: currentUser?.displayName || currentUser?.email
  });
  document.getElementById("inp-name").value = "";
  document.getElementById("inp-car").value = "";
  document.getElementById("inp-addr").value = "";
  document.getElementById("inp-advisor").value = "";
  const confirm = document.getElementById("run-confirm");
  confirm.style.display = "block";
  setTimeout(() => confirm.style.display = "none", 2500);
};

window.handleLogin = async () => {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const btn = document.getElementById("login-btn");
  const err = document.getElementById("auth-error");
  err.style.display = "none";
  btn.textContent = "Signing in…";
  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    err.textContent = friendlyError(e.code);
    err.style.display = "block";
    btn.textContent = "Sign in";
    btn.disabled = false;
  }
};

window.handleRegister = async () => {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const btn = document.getElementById("register-btn");
  const err = document.getElementById("auth-error");
  err.style.display = "none";
  if (!email || !password) { err.textContent = "Enter your email and a password."; err.style.display = "block"; return; }
  if (password.length < 6) { err.textContent = "Password must be at least 6 characters."; err.style.display = "block"; return; }
  btn.textContent = "Creating account…";
  btn.disabled = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const name = email.split("@")[0];
    await updateProfile(cred.user, { displayName: name });
  } catch (e) {
    err.textContent = friendlyError(e.code);
    err.style.display = "block";
    btn.textContent = "Create account";
    btn.disabled = false;
  }
};

window.handleSignOut = async () => {
  unsub();
  await signOut(auth);
};

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
