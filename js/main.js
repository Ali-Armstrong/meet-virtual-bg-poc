'use strict';
const webcamElement = document.getElementById('localVideo');
const canvasPerson = document.getElementById("canvasPerson");
const multiplier = 0.75;
const outputStride = 16;
const segmentationThreshold = 0.5;
const backgrounds = ["greatwall", "pyramid", "Colosseum", "monchu", "ayers-rock", "taj", "easter-island", "moon"];
const backgroundImagesPath = 'images/';
//const backgroundImagesPath =  '/wp-content/uploads/2019/10/';
//const snapSound = new Audio('/wp-content/uploads/2019/10/snap.wav');

const contextPerson = canvasPerson.getContext("2d");
let net;
let cameraFrame;
let currentBGIndex = 0;
let screenMode;

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;

var pcConfig = {
  'iceServers': [{
    'urls': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function (room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function (room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room) {
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function (room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function (array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function (message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

webcamElement.addEventListener('loadeddata', (event) => {
  console.log('Yay! The readyState just increased to  ' + 
      'HAVE_CURRENT_DATA or greater for the first time.');
});

navigator.getUserMedia({
  audio: true,
  video: true
},function(stream){
  gotStream(stream)
},function(err){
  alert('getUserMedia() error: ' + e.name);
})

function gotStream(stream) {
  console.log('Adding local stream.');
  contextPerson.clearRect(0, 0, canvasPerson.width, canvasPerson.height);
  localStream = stream;
  localVideo.srcObject = stream;
  //audioStream = new MediaStream(stream.getAudioTracks());
  bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: outputStride,
    multiplier: multiplier,
    quantBytes: 2
  })
    .catch(error => {
      console.log(error);
    })
    .then(objNet => {
      net = objNet;
      detectBody()
    })
  sendMessage('got user media');
  if (isInitiator) {
    maybeStart();
  }
}

function detectBody() {
  console.log("detect body called")
  net.segmentPerson(webcamElement, {
    flipHorizontal: false,
    internalResolution: 'medium',
    segmentationThreshold: segmentationThreshold
  })
  .catch(error => {
    console.log(error);
  })
  .then(personSegmentation => {
    if (personSegmentation != null) {
      drawBody(personSegmentation);
      detectBody()
    }
  });
}

function drawBody(personSegmentation) {
  if (screenMode == 'l') {
    var canvas = document.createElement('canvas');
    canvas.width = webcamElement.width;
    canvas.height = webcamElement.height;
    var context = canvas.getContext('2d');
    context.drawImage(webcamElement, 0, 0);
    var imageData = context.getImageData(0, 0, webcamElement.width, webcamElement.height);

    var pixel = imageData.data;
    for (var p = 0; p < pixel.length; p += 4) {
      if (personSegmentation.data[p / 4] == 0) {
        pixel[p + 3] = 0;
      }
    }
    context.imageSmoothingEnabled = true;
    context.putImageData(imageData, 0, 0);

    var imageObject = new Image();
    imageObject.onload = function () {
      contextPerson.clearRect(0, 0, canvasPerson.width, canvasPerson.height);
      contextPerson.imageSmoothingEnabled = true;
      contextPerson.drawImage(imageObject, 0, 0, canvasPerson.width, canvasPerson.height);
    }
    imageObject.src = canvas.toDataURL();
  } else {
    contextPerson.drawImage(webcamElement, 0, 0, webcamElement.width, webcamElement.height);
    var imageData = contextPerson.getImageData(0, 0, webcamElement.width, webcamElement.height);
    var pixel = imageData.data;
    for (var p = 0; p < pixel.length; p += 4) {
      if (personSegmentation.data[p / 4] == 0) {
        pixel[p + 3] = 0;
      }
    }
    contextPerson.imageSmoothingEnabled = true;
    contextPerson.putImageData(imageData, 0, 0);
  }
}

var constraints = {
  video: true
};

console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}

function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = function () {
  sendMessage('bye');
};

/////////////////////////////////////////////////////////

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}
