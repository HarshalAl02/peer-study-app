//Firebase Setup
const firebaseConfig = {
  apiKey: "AIzaSyAPE0-Ag1HH-XqKMTrgMeey76ROH9Dq1LU",
  authDomain: "peer-study-app.firebaseapp.com",
  projectId: "peer-study-app",
  storageBucket: "peer-study-app.appspot.com",
  messagingSenderId: "935338165986",
  appId: "1:935338165986:web:5c781080aa7f42e212c0bb",
};
firebase.initializeApp(firebaseConfig)
const auth = firebase.auth()
const db = firebase.firestore()

//DOM References...getting from html...
const skillForm = document.getElementById("skill-form")
const teach = document.getElementById("teach")
const learn = document.getElementById("learn")
const usersList = document.getElementById("users")
const authContainer = document.getElementById("auth-container")
const loginForm = document.getElementById("login-form")
const signupForm = document.getElementById("signup-form")
const skillSection = document.getElementById("skill-section")
const usersListContainer = document.getElementById("users-list")
const actionButtons = document.getElementById("action-buttons")
const chatModal = document.getElementById("chat-modal")
const chatWith = document.getElementById("chat-with")
const chatMessages = document.getElementById("chat-messages")
const chatInput = document.getElementById("chat-input")
const toastContainer = document.getElementById("toast-container")
const closeChatModal = document.getElementById("close-chat-modal")
const inboxBtn = document.getElementById("inbox-button")
const inboxContainer = document.getElementById("inbox-container")
const inboxList = document.getElementById("inbox-list")

//
const feedbackModal = document.getElementById("feedback-modal")
const feedbackForm = document.getElementById("feedback-form")
const feedbackText = document.getElementById("feedback-comment")
const closeFeedbackModal = document.getElementById("close-feedback-modal")
//

let currentUser = null
let chattingWithId = null
let chatUnsub = null
let inboxUnsub = null

//Just to toggle Login/Signup forms so that user can go to signin/login page as required...
function toggleForms() {
  const showLogin = loginForm.style.display === "none"
  loginForm.style.display = showLogin ? "block" : "none"
  signupForm.style.display = showLogin ? "none" : "block"
}

//Toast message popup...
function showToast(msg, type = "success") {
  const toast = document.createElement("div")
  toast.className = `toast ${type}`
  toast.textContent = msg
  toastContainer.appendChild(toast)
  setTimeout(() => toast.remove(), 4000)
}

//markdown to HTML...so that the gemini o/p with **, * and other marks get their actual styles...
function markdownToHtml(text) {
  const lines = text
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("* ")) {
        return "<li>" + line.trim().substring(2) + "</li>"
      }
      return line
    })
    .join("")
  const html = lines.includes("<li>") ? `<ul>${lines}</ul>` : lines
  return html
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)\*(\S(.*?\S)?)\*(\s|$)/g, "$1<em>$2</em>$4")
}

//Showing gemini match modal
function showMatchModal(markdownText) {
  document.getElementById("match-results").innerHTML = markdownToHtml(markdownText)
  document.getElementById("match-modal").style.display = "block"
}

document.getElementById("close-modal").onclick = () => {
  document.getElementById("match-modal").style.display = "none"
}

window.onclick = (e) => {
  if (e.target === document.getElementById("match-modal")) {
    document.getElementById("match-modal").style.display = "none"
    document.getElementById("chat-modal").style.display = "none"
  }
}

closeChatModal.onclick = () => {
  chatModal.style.display = "none"
  if (chatUnsub) chatUnsub()
}

//Login handler
function handleLogin() {
  const email = document.getElementById("login-email").value
  const password = document.getElementById("login-password").value
  auth
    .signInWithEmailAndPassword(email, password)
    .then(() => showToast("✅ Logged in!"))
    .catch((err) => showToast(err.message, "error"))
}

//Signup handler
function handleSignup() {
  const name = document.getElementById("signup-name").value
  const email = document.getElementById("signup-email").value
  const password = document.getElementById("signup-password").value
  auth
    .createUserWithEmailAndPassword(email, password)
    .then((cred) =>
      db.collection("users").doc(cred.user.uid).set({
        name,
        email,
        teachSkill: "",
        learnSkill: "",
      }),
    )
    .then(() => {
      showToast("🎉 Account created!")
      toggleForms()
    })
    .catch((err) => showToast(err.message, "error"))
}

//Auth listener
auth.onAuthStateChanged((user) => {
  currentUser = user
  if (user) {
    authContainer.style.display = "none"
    skillSection.style.display = "block"
    usersListContainer.style.display = "block"
    actionButtons.style.display = "flex"
    loadUsers()
    listenInbox()
    setupNewMessageListener()
    listenCollabRequests()
  } else {
    authContainer.style.display = "block"
    skillSection.style.display = "none"
    usersListContainer.style.display = "none"
    actionButtons.style.display = "none"
    if (chatUnsub) chatUnsub()
    if (inboxUnsub) inboxUnsub()
  }
})

//Skill Form...the same form user can update many times...will be displayed the same new...to the dashboard
skillForm.addEventListener("submit", async (e) => {
  e.preventDefault()
  if (!currentUser) return showToast("Login first", "error")
  await db.collection("users").doc(currentUser.uid).update({
    teachSkill: teach.value,
    learnSkill: learn.value,
  })
  showToast("✅ Skills updated")
  teach.value = ""
  learn.value = ""
  loadUsers()
})

//Loading all the registered users...to the dashboard
function loadUsers() {
  usersList.innerHTML = ""
  db.collection("users")
    .get()
    .then((snapshot) => {
      snapshot.forEach((doc) => {
        const data = doc.data()
        const uid = doc.id
        const li = document.createElement("li")
        const isCurrent = currentUser && uid === currentUser.uid
        li.innerHTML = `
          <div class="card">
            <h3>👤 ${data.name}</h3>
            <p>📚 Can Teach: <strong>${data.teachSkill}</strong></p>
            <p>🎯 Wants to Learn: <strong>${data.learnSkill}</strong></p>
            ${
              isCurrent
                ? `<p style="color:green;font-weight:bold;">Your Profile</p>`
                : `
                  <button onclick="openChat('${uid}', '${data.name}')" class="button-blue">Message</button>
                  <button onclick="sendCollabRequestPrompt('${uid}')" class="button-green">🤝 Request Collaboration</button>
                `
            }
          </div>
        `
        usersList.appendChild(li)
      })
    })
}


// Gemini matching
function fetchMatches() {
  if (!currentUser) return showToast("Login first!", "error")
  fetch("/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: currentUser.uid }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.matches) showMatchModal(data.matches)
      else showToast("No match found", "error")
    })
    .catch(() => showToast("❌ Gemini error", "error"))
}

//Logout button
document.getElementById("logout").addEventListener("click", () => {
  if (chatUnsub) chatUnsub()
  if (inboxUnsub) inboxUnsub()
  auth.signOut()
  showToast("👋 Logged out")
})

//Chat...
function openChat(uid, name) {
  chattingWithId = uid
  chatWith.textContent = `Chat with ${name}`
  chatModal.style.display = "block"
  chatMessages.innerHTML = ""
  document.getElementById("inbox-modal").style.display = "none"
  listenMessages()
  markAsSeen()
}

//Real-time inbox...with no. of unread messages appearing
function listenInbox() {
  inboxList.innerHTML = ""
  inboxUnsub = db
    .collection("chats")
    .where(`participants.${currentUser.uid}`, "==", true)
    .onSnapshot((snapshot) => {
      inboxList.innerHTML = ""
      const promises = snapshot.docs.map(async (doc) => {
        const data = doc.data()
        const partnerId = Object.keys(data.participants).find((id) => id !== currentUser.uid)
        const userDoc = await db.collection("users").doc(partnerId).get()
        const name = userDoc.data().name || "Unknown"
        const unreadCount = await db
          .collection("chats")
          .doc(doc.id)
          .collection("messages")
          .where("to", "==", currentUser.uid)
          .where("seen", "==", false)
          .get()
          .then((s) => s.size)
        const li = document.createElement("li")
        li.innerHTML = `
          <div class="card inbox-card">
            <h4>${name}</h4>
            ${unreadCount > 0 ? `<span class="badge">${unreadCount} new</span>` : ""}
            <button onclick="openChat('${partnerId}', '${name}')" class="button-blue">Open Chat</button>
          </div>
        `
        inboxList.appendChild(li)
      })
    })
}

//Marking messages as seen by this function
function markAsSeen() {
  const chatId = [currentUser.uid, chattingWithId].sort().join("_")
  db.collection("chats")
    .doc(chatId)
    .collection("messages")
    .where("to", "==", currentUser.uid)
    .where("seen", "==", false)
    .get()
    .then((snapshot) => {
      snapshot.forEach((doc) => {
        doc.ref.update({ seen: true })
      })
    })
}

function listenMessages() {
  const chatId = [currentUser.uid, chattingWithId].sort().join("_")
  if (chatUnsub) chatUnsub()
  chatUnsub = db
    .collection("chats")
    .doc(chatId)
    .collection("messages")
    .orderBy("timestamp")
    .onSnapshot((snapshot) => {
      chatMessages.innerHTML = ""
      snapshot.forEach((doc) => {
        const msg = doc.data()
        const div = document.createElement("div")
        div.className = msg.from === currentUser.uid ? "message self" : "message"
        div.textContent = msg.text
        chatMessages.appendChild(div)
      })
      chatMessages.scrollTop = chatMessages.scrollHeight
    })
}

function sendMessage() {
  const text = chatInput.value.trim()
  if (!text || !currentUser || !chattingWithId) return
  const chatId = [currentUser.uid, chattingWithId].sort().join("_")
  const chatRef = db.collection("chats").doc(chatId)
  const msg = {
    from: currentUser.uid,
    to: chattingWithId,
    text,
    seen: false,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  }
  chatRef.set(
    {
      participants: {
        [currentUser.uid]: true,
        [chattingWithId]: true,
      },
    },
    { merge: true },
  )
  chatRef.collection("messages").add(msg)
  chatInput.value = ""
}

function openInbox() {
  document.getElementById("inbox-modal").style.display = "block"
}

document.getElementById("close-inbox-modal").onclick = () => {
  document.getElementById("inbox-modal").style.display = "none"
}

function setupNewMessageListener() {
  const chatIds = []
  db.collection("chats")
    .where(`participants.${currentUser.uid}`, "==", true)
    .onSnapshot((snapshot) => {
      let unreadTotal = 0
      snapshot.forEach(async (chatDoc) => {
        const messagesRef = db.collection("chats").doc(chatDoc.id).collection("messages")
        const unseen = await messagesRef.where("to", "==", currentUser.uid).where("seen", "==", false).get()
        unreadTotal += unseen.size
        document.getElementById("new-msg-indicator").textContent = unreadTotal > 0 ? `(${unreadTotal})` : ""
      })
    })
}

// DOM Refs for collaboration modal
const collabModal = document.getElementById("collab-request-modal")
const collabForm = document.getElementById("collab-request-form")
const collabSkill = document.getElementById("collab-skill")
const collabDate = document.getElementById("collab-date")
const collabMessage = document.getElementById("collab-message")
const closeCollabModal = document.getElementById("close-collab-request-modal")

let targetUserForCollab = null

function sendCollabRequestPrompt(userId) {
  if (!currentUser) return showToast("Login first!", "error")
  targetUserForCollab = userId
  collabSkill.value = ""
  collabDate.value = ""
  collabMessage.value = ""
  collabModal.style.display = "block"
}

closeCollabModal.onclick = () => {
  collabModal.style.display = "none"
}

collabForm.addEventListener("submit", async (e) => {
  e.preventDefault()
  if (!targetUserForCollab) return showToast("Missing target user!", "error")

  const newRequest = {
    from: currentUser.uid,
    to: targetUserForCollab,
    skill: collabSkill.value.trim(),
    date: collabDate.value,
    message: collabMessage.value.trim(),
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  }

  const chatRoomId = [currentUser.uid, targetUserForCollab].sort().join("_")

await db.collection("collaborations").add(newRequest)

// Send as a message in chat
await db.collection("chats").doc(chatRoomId).set({
  participants: {
    [currentUser.uid]: true,
    [targetUserForCollab]: true
  }
}, { merge: true })

await db.collection("chats").doc(chatRoomId).collection("messages").add({
  from: currentUser.uid,
  to: targetUserForCollab,
  text: `🔗 Collaboration joining link: ${collabMessage.value.trim()}`,
  seen: false,
  timestamp: firebase.firestore.FieldValue.serverTimestamp()
})

collabModal.style.display = "none"
showToast("✅ Collaboration request sent and link shared in chat!")

})

function listenCollabRequests() {
  const collabList = document.getElementById("collab-requests-list")
  if (!collabList || !currentUser) return

  db.collection("collaborations")
    .where("to", "==", currentUser.uid)
    .orderBy("createdAt", "desc")
    .onSnapshot(async (snapshot) => {
      collabList.innerHTML = ""
      for (const doc of snapshot.docs) {
        const data = doc.data()
        const senderSnap = await db.collection("users").doc(data.from).get()
        const sender = senderSnap.data()
        const li = document.createElement("li")
        li.className = "card"
        li.innerHTML = `
  <h4>👤 ${sender?.name || "Someone"} wants to collaborate</h4>
  <p><strong>Skill:</strong> ${data.skill}</p>
  <p><strong>Date:</strong> ${data.date}</p>
  <p>${data.message || ""}</p>
  <span class="badge badge-${data.status}">${data.status}</span>
  ${
    data.status === "pending"
      ? `
      <div style="margin-top: 15px;">
        <button class="button-green" onclick="handleCollabDecision('${doc.id}', 'accepted')">✅ Accept</button>
        <button class="button-red" onclick="handleCollabDecision('${doc.id}', 'declined')">❌ Reject</button>
      </div>
      `
      : ""
  }
`

        collabList.appendChild(li)
      }
    })
}

function handleCollabDecision(requestId, decision) {
  if (decision === "accepted") {
    // Get the doc data first to set participants array
    db.collection("collaborations")
      .doc(requestId)
      .get()
      .then((doc) => {
        const data = doc.data()
        return db.collection("collaborations")
          .doc(requestId)
          .update({
            status: decision,
            participants: [data.from, data.to]
          })
      })
      .then(() => {
        showToast("Request accepted successfully.", "success")
      })
      .catch((err) => {
        console.error("Failed to update request status:", err)
        showToast("❌ Failed to update request", "error")
      })
  } else {
    // Just update status for declined
    db.collection("collaborations")
      .doc(requestId)
      .update({ status: decision })
      .then(() => {
        showToast("Request rejected successfully.", "success")
      })
      .catch((err) => {
        console.error("Failed to update request status:", err)
        showToast("❌ Failed to update request", "error")
      })
  }
}


function showCollabDashboard() {
  const dashboard = document.getElementById("collab-dashboard")
  const list = document.getElementById("accepted-collab-list")

  if (!currentUser) return showToast("Login first!", "error")

  dashboard.style.display = "block"
  list.innerHTML = ""

  db.collection("collaborations")
    .where("participants", "array-contains", currentUser.uid)
    .orderBy("createdAt", "desc")
    .onSnapshot(async (snapshot) => {
      list.innerHTML = ""

      if (snapshot.empty) {
        list.innerHTML = "<li>No collaborations found.</li>"
        return
      }

      for (const doc of snapshot.docs) {
        const data = doc.data()
        const partnerId = data.from === currentUser.uid ? data.to : data.from
        const userSnap = await db.collection("users").doc(partnerId).get()
        const name = userSnap.exists ? userSnap.data().name : "Unknown"

        const li = document.createElement("li")
        li.className = "card"
        li.innerHTML = `
          <h4>🤝 With: ${name}</h4>
          <p><strong>Skill:</strong> ${data.skill}</p>
          <p><strong>Date:</strong> ${data.date}</p>
          ${
  data.message && data.status !== "completed"
    ? `<p>💬 ${
        data.message.replace(
          /(https?:\/\/[^\s]+)/g,
          (url) => `<a href="${url}" target="_blank">${url}</a>`
        )
      }</p>`
    : ""
}


          ${
            data.status === "accepted"
              ? `<button class="button-green" onclick="openFeedbackModal('${doc.id}')">✅ Mark as Complete</button>`
              : data.status === "completed"
              ? `
                <p><strong>Status:</strong> ✅ Completed</p>
                <p><strong>Feedback:</strong> ${data.feedback || "No feedback given."}</p>
                ${
                  data.rating
                    ? `<p><strong>Rating:</strong> ${"🌟".repeat(Number(data.rating))}</p>`
                    : ""
                }
                ${
                  data.githubLink
                    ? `<p><strong>Project Link:</strong> <a href="${data.githubLink}" target="_blank">${data.githubLink}</a></p>`
                    : ""
                }
              `
              : ""
          }
        `
        list.appendChild(li)
      }
    })
}

function openFeedbackModal(collabId) {
  if (!currentUser) return showToast("Login first!", "error")

  feedbackModal.style.display = "block"
  feedbackText.value = ""
  document.getElementById("feedback-rating").value = ""
  document.getElementById("feedback-github").value = ""

  feedbackForm.onsubmit = async (e) => {
    e.preventDefault()
    const feedback = feedbackText.value.trim()
    const rating = document.getElementById("feedback-rating").value
    const githubLink = document.getElementById("feedback-github").value.trim()

    if (!feedback || !rating) {
      return showToast("Please provide both feedback and rating.", "error")
    }

    try {
      await db.collection("collaborations").doc(collabId).update({
        status: "completed",
        feedback,
        rating,
        githubLink,
      })
      feedbackModal.style.display = "none"
      showToast("✅ Collaboration marked as complete with feedback!")
    } catch (err) {
      console.error("Error submitting feedback:", err)
      showToast("❌ Failed to submit feedback", "error")
    }
  }
}


closeFeedbackModal.onclick = () => {
  feedbackModal.style.display = "none"
}
