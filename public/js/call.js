const token = localStorage.getItem('token');
const userId = localStorage.getItem('userId');

if (!token || !userId) {
  window.location.href = '/';
}

// Get call parameters from URL
const urlParams = new URLSearchParams(window.location.search);
const callId = urlParams.get('callId');
const callType = urlParams.get('type');

if (!callId) {
  alert('Invalid call link');
  window.close();
}

// Initialize elements
const socket = io({
  auth: {
    token: token
  }
});

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const callWaiting = document.getElementById('callWaiting');
const callStatus = document.getElementById('callStatus');

// Control buttons
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const endCallBtn = document.getElementById('endCallBtn');
const addParticipantBtn = document.getElementById('addParticipantBtn');
const shareLinkBtn = document.getElementById('shareLinkBtn');

// Modals
const addParticipantModal = document.getElementById('addParticipantModal');
const shareLinkModal = document.getElementById('shareLinkModal');
const participantUsername = document.getElementById('participantUsername');
const callLinkInput = document.getElementById('callLinkInput');

// WebRTC variables
let localStream;
let peerConnection;
let isMuted = false;
let isVideoOff = false;
let currentCall = JSON.parse(localStorage.getItem('currentCall') || '{}');

// ICE servers for WebRTC
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Initialize call
async function initCall() {
  try {
    // Get user media
    const constraints = {
      audio: true,
      video: callType === 'video'
    };

    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;

    // Create peer connection
    peerConnection = new RTCPeerConnection(iceServers);

    // Add local stream tracks to peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      callWaiting.style.display = 'none';
      remoteVideo.style.display = 'block';
      callStatus.textContent = 'Connected';
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('iceCandidate', {
          callId,
          candidate: event.candidate
        });
      }
    };

    // Join call room
    socket.emit('joinCall', { callId });

    // Update UI based on call type
    if (callType === 'voice') {
      localVideo.style.display = 'none';
      remoteVideo.style.display = 'none';
      callWaiting.style.display = 'block';
    }

  } catch (error) {
    console.error('Error initializing call:', error);
    alert('Could not access camera/microphone');
  }
}

// Control functions
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach(track => {
    track.enabled = !isMuted;
  });
  muteBtn.textContent = isMuted ? '🔇' : '🎤';
});

videoBtn.addEventListener('click', () => {
  if (callType === 'video') {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(track => {
      track.enabled = !isVideoOff;
    });
    videoBtn.textContent = isVideoOff ? '📷' : '📹';
  }
});

endCallBtn.addEventListener('click', () => {
  endCall();
});

addParticipantBtn.addEventListener('click', () => {
  addParticipantModal.style.display = 'flex';
});

shareLinkBtn.addEventListener('click', () => {
  const callLink = `${window.location.origin}/call.html?callId=${callId}&type=${callType}`;
  callLinkInput.value = callLink;
  shareLinkModal.style.display = 'flex';
});

// Modal controls
document.getElementById('closeModalBtn').addEventListener('click', () => {
  addParticipantModal.style.display = 'none';
});

document.getElementById('closeShareModalBtn').addEventListener('click', () => {
  shareLinkModal.style.display = 'none';
});

document.getElementById('addParticipantConfirmBtn').addEventListener('click', () => {
  const username = participantUsername.value.trim();
  if (username) {
    socket.emit('addParticipant', { callId, username });
    participantUsername.value = '';
    addParticipantModal.style.display = 'none';
  }
});

document.getElementById('copyLinkBtn').addEventListener('click', () => {
  callLinkInput.select();
  document.execCommand('copy');
  alert('Link copied to clipboard');
});

// Socket event handlers
socket.on('callJoined', async (data) => {
  if (data.initiatorId !== userId) {
    // Create offer if we're the initiator
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('offer', { callId, offer });
  }
});

socket.on('offer', async (data) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  socket.emit('answer', { callId, answer });
});

socket.on('answer', async (data) => {
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('iceCandidate', async (data) => {
  if (data.candidate) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

socket.on('participantAdded', (data) => {
  alert(`Participant ${data.username} added to call`);
});

socket.on('callEnded', () => {
  endCall();
});

// End call function
function endCall() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (peerConnection) {
    peerConnection.close();
  }
  socket.emit('endCall', { callId });
  localStorage.removeItem('currentCall');
  window.close();
}

// Update call UI with user info
function updateCallUI() {
  const callData = JSON.parse(localStorage.getItem('currentCall') || '{}');
  if (callData.withUser) {
    document.getElementById('callUserName').textContent = callData.withUser.username;
    const avatarDiv = document.getElementById('callUserAvatar');
    if (callData.withUser.avatar) {
      avatarDiv.style.backgroundImage = `url(${callData.withUser.avatar})`;
    } else {
      avatarDiv.textContent = callData.withUser.username.charAt(0).toUpperCase();
    }
    document.getElementById('waitingAvatar').textContent = callData.withUser.username.charAt(0).toUpperCase();
  }
}

// Initialize
updateCallUI();
initCall();

// Handle page unload
window.addEventListener('beforeunload', () => {
  endCall();
});
