import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDT7hIbXv2tBQbuWnXnqSFcmsujrDAe_Z0",
  authDomain: "apex-83502.firebaseapp.com",
  projectId: "apex-83502",
  storageBucket: "apex-83502.firebasestorage.app",
  messagingSenderId: "1014117686331",
  appId: "1:1014117686331:web:07c8a2294e9d032dde101e"
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

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const userSnap = await getDoc(doc(db, "dealerships", DEALERSHIP, "users", user.uid));
    if (!userSnap.exists()) { showPending(); return; }
    const userData = userSnap.data();
    if (userData.status === "pending") { showPending(); return; }
    currentRole = userData.role;
    launchApp(user, userData);
  } else {
    currentUser = null;
    currentRole = null;
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
  const roleLabels = { porter: "Porter", advisor: "Service Advisor", manager: "Service Manager" };
  const roleClasses = { porter: "rb-porter", advisor: "rb-advisor", manager: "rb-manager" };
  const rl = roleLabels[currentRole] || currentRole;
  const rc = roleClasses[currentRole] || "rb-porter";
  document.getElementById("header-role-label").innerHTML = '<span class="role-badge ' + rc + '">' + rl + '</span>';
  applyRoleUI(currentRole);
  startListeners();
}

function applyRoleUI(role) {
  document.querySelectorAll(".advisor-only").forEach(function(el) {
    el.style.display = (role === "advisor" || role === "manager") ? "block" : "none";
  });
  document.querySelectorAll(".manager-only").forEach(function(el) {
    el.style.display = role === "manager" ? "block" : "none";
  });
  if (role === "advisor" || role === "manager") {
    document.getElementById("my-status-section").style.display = "none";
  }
}

function startListeners() {
  const usersRef = collection(db, "dealerships", DEALERSHIP, "users");
  const u1 = onSnapshot(usersRef, function(snap) {
    const all = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    const approved = all.filter(function(u) { return u.status === "approved"; });
    const porters = approved.filter(function(u) { return u.role === "porter"; });
    renderPorters(porters);
    updateStats(porters);
    populatePorterSelect(porters);
    if (currentRole === "manager") {
      renderAdminUsers(approved);
      renderPendingUsers(all.filter(function(u) { return u.status === "pending"; }));
    }
  });

  const runsRef = query(collection(db, "dealerships", DEALERSHIP, "runs"), orderBy("createdAt", "desc"));
  const u2 = onSnapshot(runsRef, function(snap) {
    const runs = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    renderRuns(runs);
    renderMapRuns(runs);
  });

  const msgsRef = query(collection(db, "dealerships", DEALERSHIP, "messages"), orderBy("createdAt", "asc"));
  const u3 = onSnapshot(msgsRef, function(snap) {
    renderMessages(snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }));
  });

  unsubscribers.push(u1, u2, u3);
}

const avatarClasses = ["pav-b", "pav-g", "pav-s", "pav-j", "pav-default"];
const statusClassMap = { available: "p-avail", enroute: "p-enroute", returning: "p-return", busy: "p-busy", lunch: "p-lunch" };
const statusLabelMap = { available: "Available", enroute: "En route", returning: "Returning", busy: "On lot", lunch: "Lunch" };

function renderPorters(porters) {
  const list = document.getElementById("porter-list");
  if (!porters.length) {
    list.innerHTML = '<div class="empty-state"><i class="ti ti-users"></i><p>No porters yet</p></div>';
    return;
  }
  var html = "";
  porters.forEach(function(p, i) {
    var initials = (p.name || "?").split(" ").map(function(w) { return w[0]; }).join("").slice(0, 2).toUpperCase();
    var isMe = p.id === (currentUser && currentUser.uid);
    var avClass = isMe ? "pav-z" : avatarClasses[i % avatarClasses.length];
    var sc = statusClassMap[p.status] || "p-busy";
    var sl = statusLabelMap[p.status] || p.status;
    var meLabel = isMe ? " &middot; You" : "";
    html += '<div class="porter-row">';
    html += '<div class="pav ' + avClass + '">' + initials + '</div>';
    html += '<div class="pinfo"><div class="pname">' + p.name + meLabel + '</div>';
    html += '<div class="pdetail">' + (p.detail || "At dealership") + '</div></div>';
    html += '<span class="pill ' + sc + '">' + sl + '</span>';
    html += '</div>';
  });
  list.innerHTML = html;
  if (currentRole === "porter") {
    var me = porters.find(function(p) { return p.id === (currentUser && currentUser.uid); });
    if (me) highlightStatusBtn(me.status);
  }
}

function highlightStatusBtn(status) {
  document.querySelectorAll(".status-btn").forEach(function(b) { b.classList.remove("active-status"); });
  var map = { available: "s-btn-avail", enroute: "s-btn-enroute", returning: "s-btn-return", busy: "s-btn-busy", lunch: "s-btn-lunch" };
  var cls = map[status];
  if (cls) {
    var btn = document.querySelector("." + cls);
    if (btn) btn.classList.add("active-status");
  }
}

function updateStats(porters) {
  document.getElementById("sn-porters").textContent = porters.length;
  document.getElementById("sn-available").textContent = porters.filter(function(p) { return p.status === "available"; }).length;
}

function populatePorterSelect(porters) {
  var sel = document.getElementById("inp-porter");
  var cur = sel.value;
  var html = '<option value="">Unassigned</option>';
  porters.forEach(function(p) { html += '<option value="' + p.name + '">' + p.name + '</option>'; });
  sel.innerHTML = html;
  if (cur) sel.value = cur;
}

function renderRuns(runs) {
  var active = runs.filter(function(r) { return r.status !== "complete"; });
  document.getElementById("sn-active").textContent = active.length;
  var list = document.getElementById("run-list");
  if (!active.length) {
    list.innerHTML = '<div class="empty-state"><i class="ti ti-car"></i><p>No active runs</p></div>';
    return;
  }
  var html = "";
  active.forEach(function(r) {
    var hasPorter = r.porter && r.porter !== "Unassigned";
    var sc = hasPorter ? "p-enroute" : "p-unassign";
    var sl = hasPorter ? "Active" : "Unassigned";
    html += '<div class="run-card" onclick="window.openRun(\'' + r.id + '\')">';
    html += '<div class="run-top">';
    html += '<div><div class="run-name">' + r.customer + ' <span class="run-id">' + (r.runId || "") + '</span></div>';
    html += '<div class="run-car">' + (r.car || "—") + '</div></div>';
    html += '<span class="pill ' + sc + '">' + sl + '</span>';
    html += '</div>';
    html += '<div class="run-addr"><i class="ti ti-map-pin" style="font-size:12px"></i>' + (r.address || "—") + '</div>';
    html += '<div class="run-footer">';
    html += '<div class="run-meta"><i class="ti ti-user" style="font-size:12px"></i>' + (r.porter || "Unassigned") + '</div>';
    html += '<div class="run-meta"><i class="ti ti-headset" style="font-size:12px"></i>' + (r.advisor || "—") + '</div>';
    html += '<div class="run-meta"><i class="ti ti-tag" style="font-size:12px"></i>' + (r.type || "—") + '</div>';
    html += '</div></div>';
  });
  list.innerHTML = html;
}

var mapPositions = [{x:75,y:55},{x:265,y:55},{x:195,y:165},{x:60,y:155},{x:290,y:145}];

function renderMapRuns(runs) {
  var active = runs.filter(function(r) { return r.status !== "complete"; });
  var pinsG = document.getElementById("map-run-pins");
  if (pinsG) {
    var pinsHtml = "";
    active.slice(0, 5).forEach(function(r, i) {
      var pos = mapPositions[i] || mapPositions[0];
      var color = (r.porter && r.porter !== "Unassigned") ? "#4a9" : "#6ab";
      var label = r.runId || ("R" + (i + 1));
      var porterFirst = (r.porter && r.porter !== "Unassigned") ? r.porter.split(" ")[0] : "";
      pinsHtml += '<line x1="176" y1="105" x2="' + pos.x + '" y2="' + pos.y + '" stroke="' + color + '44" stroke-width="1" stroke-dasharray="4,3"/>';
      pinsHtml += '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="7" fill="#1a2820" stroke="' + color + '" stroke-width="1"/>';
      pinsHtml += '<text x="' + pos.x + '" y="' + (pos.y + 4) + '" text-anchor="middle" font-size="7" fill="' + color + '" font-family="sans-serif">' + label + '</text>';
      pinsHtml += '<text x="' + pos.x + '" y="' + (pos.y - 12) + '" text-anchor="middle" font-size="9" fill="' + color + '" font-family="sans-serif">' + porterFirst + '</text>';
    });
    pinsG.innerHTML = pinsHtml;
  }
  var mapList = document.getElementById("map-run-list");
  if (mapList) {
    if (!active.length) {
      mapList.innerHTML = '<div class="empty-state"><i class="ti ti-map-pin"></i><p>No active runs</p></div>';
    } else {
      var mhtml = "";
      active.forEach(function(r) {
        var hasPorter = r.porter && r.porter !== "Unassigned";
        var sc = hasPorter ? "p-enroute" : "p-unassign";
        mhtml += '<div class="run-card" onclick="window.openRun(\'' + r.id + '\')">';
        mhtml += '<div class="run-top">';
        mhtml += '<div><div class="run-name">' + r.customer + ' <span class="run-id">' + (r.runId || "") + '</span></div>';
        mhtml += '<div class="run-car">' + (r.car || "—") + '</div></div>';
        mhtml += '<span class="pill ' + sc + '">' + (r.porter || "Unassigned") + '</span>';
        mhtml += '</div>';
        mhtml += '<div class="run-addr"><i class="ti ti-map-pin" style="font-size:12px"></i>' + (r.address || "—") + '</div>';
        mhtml += '</div>';
      });
      mapList.innerHTML = mhtml;
    }
  }
  var nb = document.getElementById("nearby-banner");
  if (nb) nb.style.display = active.length >= 2 ? "flex" : "none";
}

function renderMessages(msgs) {
  var thread = document.getElementById("comms-thread");
  if (!msgs.length) {
    thread.innerHTML = '<div class="empty-state" style="padding:16px;"><i class="ti ti-message"></i><p>No messages yet</p></div>';
    return;
  }
  var html = "";
  msgs.forEach(function(m) {
    var mine = m.uid === (currentUser && currentUser.uid);
    var time = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "just now";
    var wrapClass = mine ? "msg-wrap mine" : "msg-wrap";
    var bubbleClass = mine ? "msg-bubble msg-mine" : "msg-bubble msg-theirs";
    var sender = mine ? "You" : m.senderName;
    html += '<div class="' + wrapClass + '">';
    html += '<div class="' + bubbleClass + '">' + m.text + '</div>';
    html += '<div class="msg-sender">' + sender + ' &middot; ' + time + '</div>';
    html += '</div>';
  });
  thread.innerHTML = html;
  thread.scrollTop = thread.scrollHeight;
}

function renderPendingUsers(pending) {
  var list = document.getElementById("pending-list");
  if (!list) return;
  if (!pending.length) {
    list.innerHTML = '<div class="empty-state"><i class="ti ti-user-check"></i><p>No pending accounts</p></div>';
    return;
  }
  var html = "";
  pending.forEach(function(u) {
    html += '<div class="admin-card">';
    html += '<div class="admin-card-top">';
    html += '<div><div class="admin-name">' + (u.name || "—") + '</div>';
    html += '<div class="admin-email">' + (u.email || "—") + ' &middot; Requested: ' + (u.requestedRole || "porter") + '</div></div>';
    html += '<span class="pill p-pending">Pending</span>';
    html += '</div>';
    html += '<div class="admin-actions">';
    html += '<select class="role-select" id="role-sel-' + u.id + '">';
    html += '<option value="porter"' + (u.requestedRole === "porter" ? " selected" : "") + '>Porter</option>';
    html += '<option value="advisor"' + (u.requestedRole === "advisor" ? " selected" : "") + '>Advisor</option>';
    html += '<option value="manager"' + (u.requestedRole === "manager" ? " selected" : "") + '>Manager</option>';
    html += '</select>';
    html += '<button class="btn-approve" onclick="window.approveUser(\'' + u.id + '\')"><i class="ti ti-check"></i> Approve</button>';
    html += '<button class="btn-remove" onclick="window.denyUser(\'' + u.id + '\')">Deny</button>';
    html += '</div></div>';
  });
  list.innerHTML = html;
}

function renderAdminUsers(users) {
  var list = document.getElementById("admin-user-list");
  if (!list) return;
  var html = "";
  users.forEach(function(u) {
    var isMe = u.id === (currentUser && currentUser.uid);
    var rolePill = u.role === "manager" ? "p-lunch" : u.role === "advisor" ? "p-avail" : "p-enroute";
    html += '<div class="admin-card">';
    html += '<div class="admin-card-top">';
    html += '<div><div class="admin-name">' + (u.name || "—") + (isMe ? " &middot; You" : "") + '</div>';
    html += '<div class="admin-email">' + (u.email || "—") + '</div></div>';
    html += '<span class="pill ' + rolePill + '">' + (u.role || "porter") + '</span>';
    html += '</div>';
    if (!isMe) {
      html += '<div class="admin-actions">';
      html += '<select class="role-select" id="change-role-' + u.id + '" onchange="window.changeRole(\'' + u.id + '\', this.value)">';
      html += '<option value="porter"' + (u.role === "porter" ? " selected" : "") + '>Porter</option>';
      html += '<option value="advisor"' + (u.role === "advisor" ? " selected" : "") + '>Advisor</option>';
      html += '<option value="manager"' + (u.role === "manager" ? " selected" : "") + '>Manager</option>';
      html += '</select>';
      html += '<button class="btn-remove" onclick="window.removeUser(\'' + u.id + '\')">Remove</button>';
      html += '</div>';
    }
    html += '</div>';
  });
  list.innerHTML = html || '<div class="empty-state"><i class="ti ti-users"></i><p>No team members yet</p></div>';
}

window.showTab = function(id, el) {
  document.querySelectorAll(".page").forEach(function(p) { p.classList.remove("active"); });
  document.querySelectorAll(".nav-item").forEach(function(t) { t.classList.remove("active"); });
  document.getElementById("page-" + id).classList.add("active");
  el.classList.add("active");
};

window.selectRole = function(role) {
  selectedRole = role;
  document.querySelectorAll(".role-option").forEach(function(el) { el.classList.remove("selected"); });
  var el = document.getElementById("role-" + role);
  if (el) el.classList.add("selected");
};

window.toggleForm = function(form) {
  document.getElementById("auth-error").style.display = "none";
  document.getElementById("login-form").style.display = form === "login" ? "block" : "none";
  document.getElementById("register-form").style.display = form === "register" ? "block" : "none";
};

window.setMyStatus = async function(status, detail) {
  if (!currentUser || currentRole !== "porter") return;
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", currentUser.uid), { status: status, detail: detail });
};

window.openRun = async function(id) {
  var snap = await getDoc(doc(db, "dealerships", DEALERSHIP, "runs", id));
  if (!snap.exists()) return;
  var r = Object.assign({ id: snap.id }, snap.data());
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

window.closeModal = function() {
  document.getElementById("run-modal").style.display = "none";
  activeRunId = null;
};

window.openNav = async function() {
  if (!activeRunId) return;
  var snap = await getDoc(doc(db, "dealerships", DEALERSHIP, "runs", activeRunId));
  if (!snap.exists()) return;
  var r = snap.data();
  document.getElementById("nav-confirm").style.display = "block";
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "runs", activeRunId), { status: "enroute" });
  if (currentRole === "porter") {
    await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", currentUser.uid), {
      status: "enroute",
      detail: "En route · " + r.type + " · " + (r.address || "").split(",")[0]
    });
  }
  setTimeout(function() {
    var addr = encodeURIComponent(r.address || "");
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    var url = isIOS ? "maps://?q=" + addr : "https://maps.google.com/?q=" + addr;
    window.open(url, "_blank");
  }, 600);
};

window.completeRun = async function() {
  if (!activeRunId) return;
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "runs", activeRunId), { status: "complete", completedAt: serverTimestamp() });
  if (currentRole === "porter") {
    await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", currentUser.uid), { status: "available", detail: "Available · Just completed a run" });
  }
  window.closeModal();
};

window.sendTeamMessage = async function() {
  var input = document.getElementById("comms-msg");
  var text = input.value.trim();
  if (!text || !currentUser) return;
  input.value = "";
  await addDoc(collection(db, "dealerships", DEALERSHIP, "messages"), {
    text: text,
    uid: currentUser.uid,
    senderName: currentUser.displayName || currentUser.email.split("@")[0],
    createdAt: serverTimestamp()
  });
};

window.sendQuickMsg = async function(text) {
  if (!currentUser) return;
  await addDoc(collection(db, "dealerships", DEALERSHIP, "messages"), {
    text: text,
    uid: currentUser.uid,
    senderName: currentUser.displayName || currentUser.email.split("@")[0],
    createdAt: serverTimestamp()
  });
};

var runCounter = 44;
window.createRun = async function() {
  var name = document.getElementById("inp-name").value.trim();
  var addr = document.getElementById("inp-addr").value.trim();
  if (!name || !addr) { alert("Customer name and address are required."); return; }
  runCounter++;
  await addDoc(collection(db, "dealerships", DEALERSHIP, "runs"), {
    runId: "R-0" + runCounter,
    customer: name,
    car: document.getElementById("inp-car").value.trim() || "—",
    address: addr,
    porter: document.getElementById("inp-porter").value || "Unassigned",
    advisor: document.getElementById("inp-advisor").value.trim() || "—",
    type: document.getElementById("inp-type").value,
    status: "active",
    createdAt: serverTimestamp(),
    createdBy: (currentUser && (currentUser.displayName || currentUser.email)) || "—"
  });
  ["inp-name", "inp-car", "inp-addr", "inp-advisor"].forEach(function(id) { document.getElementById(id).value = ""; });
  var confirm = document.getElementById("run-confirm");
  confirm.style.display = "block";
  setTimeout(function() { confirm.style.display = "none"; }, 2500);
};

window.approveUser = async function(uid) {
  var roleSel = document.getElementById("role-sel-" + uid);
  var role = roleSel ? roleSel.value : "porter";
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", uid), { status: "approved", role: role });
};

window.denyUser = async function(uid) {
  if (confirm("Remove this account request?")) {
    await deleteDoc(doc(db, "dealerships", DEALERSHIP, "users", uid));
  }
};

window.changeRole = async function(uid, role) {
  await updateDoc(doc(db, "dealerships", DEALERSHIP, "users", uid), { role: role });
};

window.removeUser = async function(uid) {
  if (confirm("Remove this team member?")) {
    await deleteDoc(doc(db, "dealerships", DEALERSHIP, "users", uid));
  }
};

window.handleLogin = async function() {
  var email = document.getElementById("auth-email").value.trim();
  var password = document.getElementById("auth-password").value;
  var btn = document.getElementById("login-btn");
  var err = document.getElementById("auth-error");
  err.style.display = "none";
  btn.textContent = "Signing in…";
  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch(e) {
    err.textContent = friendlyError(e.code);
    err.style.display = "block";
    btn.textContent = "Sign in";
    btn.disabled = false;
  }
};

window.handleRegister = async function() {
  var name = document.getElementById("reg-name").value.trim();
  var email = document.getElementById("reg-email").value.trim();
  var password = document.getElementById("reg-password").value;
  var err = document.getElementById("auth-error");
  err.style.display = "none";
  if (!name) { err.textContent = "Please enter your name."; err.style.display = "block"; return; }
  if (!email) { err.textContent = "Please enter your email."; err.style.display = "block"; return; }
  if (password.length < 6) { err.textContent = "Password must be at least 6 characters."; err.style.display = "block"; return; }
  if (!selectedRole) { err.textContent = "Please select your role."; err.style.display = "block"; return; }
  var btn = document.getElementById("register-btn");
  btn.textContent = "Requesting access…";
  btn.disabled = true;
  try {
    var cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "dealerships", DEALERSHIP, "users", cred.user.uid), {
      name: name,
      email: email,
      role: selectedRole,
      requestedRole: selectedRole,
      status: "pending",
      uid: cred.user.uid,
      createdAt: serverTimestamp()
    });
    await signOut(auth);
    showPending();
  } catch(e) {
    err.textContent = friendlyError(e.code);
    err.style.display = "block";
    btn.textContent = "Request access";
    btn.disabled = false;
  }
};

window.handleSignOut = async function() {
  unsub();
  await signOut(auth);
};

function friendlyError(code) {
  var map = {
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
