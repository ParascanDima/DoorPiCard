export default class Signal {
    constructor(url, onError, onClose, onMessage) {
        if (!"WebSocket" in window) {
            onError("Sorry, this browser does not support Web Sockets. Bye.");
            return;
        }

        RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
        RTCSessionDescription = window.RTCSessionDescription;
        RTCIceCandidate = window.RTCIceCandidate;

        /* First we create a peer connection */
        this.pc = new RTCPeerConnection(
            {"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]},
            {optional: []}
        );

        //this.localStream = stream;
        this.localStream = null;
        this.ws = Signal.initWebSocket(url, this.pc, onError, onClose, onMessage);
    }

    call(stream, onStream) {

        this.localStream = stream;

        if ('ontrack' in this.pc) {
            this.pc.ontrack = (event) => {
                onStream(event.streams[0]);
            };
        } else {  // onaddstream() deprecated
            this.pc.onaddstream = (event) => {
                onStream(event.stream);
            };
        }

        this.pc.onremovestream = (event) => console.log("the stream has been removed: do your stuff now");
        this.pc.ondatachannel =  (event) => console.log("a data channel is available: do your stuff with it");

        if (stream) {
            this.pc.addStream(stream);
        }

        /* kindly signal the remote peer that we would like to initiate a call */
        /*const request = {
            what: "call",
            options: {
                force_hw_vcodec: false,
                vformat: 30, /* 30=640x480, 30 fps *
                trickle_ice: true
            }
        };
        console.log("send message " + JSON.stringify(request));
        this.ws.send(JSON.stringify(request)); */
    }

    hangup() {
        if (this.ws) {
            const request = {
                what: "hangup"
            };
            console.log("send message " + JSON.stringify(request));
            this.ws.send(JSON.stringify(request));
            //this.ws.close();
        }
        if (this.localStream) {
            try {
                if (this.localStream.getVideoTracks().length)
                    this.localStream.getVideoTracks()[0].stop();
                if (this.localStream.getAudioTracks().length)
                    this.localStream.getAudioTracks()[0].stop();
                this.localStream.stop(); // deprecated
            } catch (e) {
                for (var i = 0; i < this.localStream.getTracks().length; i++)
                    this.localStream.getTracks()[i].stop();
            }
            this.localStream = null;
        }
    };


    static initWebSocket(url, rtcPeerConnection, onError, onClose, onMessage) {
        console.log("opening web socket: " + url);
        let ws = new WebSocket(url);
        let iceCandidates = [];
        let hasRemoteDesc = false;

        const addIceCandidates = () => {
            if (hasRemoteDesc) {
                iceCandidates.forEach((candidate) => {
                    rtcPeerConnection.addIceCandidate(candidate,
                        function () {
                            console.log("IceCandidate added: " + JSON.stringify(candidate));
                        },
                        function (error) {
                            console.error("addIceCandidate error: " + error);
                        }
                    );
                });
                iceCandidates = [];
            }
        }

        ws.onopen = () => {
            iceCandidates = [];
            hasRemoteDesc = false;

            rtcPeerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    const candidate = {
                        sdpMLineIndex: event.candidate.sdpMLineIndex,
                        sdpMid: event.candidate.sdpMid,
                        candidate: event.candidate.candidate
                    };
                    const request = {
                        what: "addIceCandidate",
                        data: JSON.stringify(candidate)
                    };
                    ws.send(JSON.stringify(request));
                } else {
                    console.log("end of candidates.");
                }
            };
            const request = {
                what: "call",
                options: {
                    force_hw_vcodec: false,
                    vformat: 30, /* 30=640x480, 30 fps */
                    trickle_ice: true
                }
            };
            //console.log("send message " + JSON.stringify(request));
            ws.send(JSON.stringify(request));
            //Signal.call(ws, rtcPeerConnection, stream, onStream);
        };

        ws.onmessage = (evt) => {
            var msg = JSON.parse(evt.data);
            var what = msg.what;
            var data = msg.data;

            console.log("received message " + JSON.stringify(msg));

            switch (what) {
                case "offer":
                    var mediaConstraints = {
                        optional: [],
                        mandatory: {
                            OfferToReceiveAudio: true,
                            OfferToReceiveVideo: true
                        }
                    };
                    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(JSON.parse(data)),
                            function onRemoteSdpSuccess() {
                                hasRemoteDesc = true;
                                addIceCandidates();
                                rtcPeerConnection.createAnswer(function (sessionDescription) {
                                    rtcPeerConnection.setLocalDescription(sessionDescription);
                                    const request = {
                                        what: "answer",
                                        data: JSON.stringify(sessionDescription)
                                    };
                                    ws.send(JSON.stringify(request));
                                }, function (error) {
                                    onError("failed to create answer: " + error);
                                }, mediaConstraints);
                            },
                            function onRemoteSdpError(event) {
                                onError('failed to set the remote description: ' + event);
                                ws.close();
                            }
                    );

                    break;

                case "answer":
                    break;

                case "message":
                    if (onMessage) {
                        onMessage(msg.data);
                    }
                    break;

                case "iceCandidate": // received when trickle ice is used (see the "call" request)
                    if (!msg.data) {
                        console.log("Ice Gathering Complete");
                        break;
                    }
                    var elt = JSON.parse(msg.data);
                    let candidate = new RTCIceCandidate({sdpMLineIndex: elt.sdpMLineIndex, candidate: elt.candidate});
                    iceCandidates.push(candidate);
                    addIceCandidates(); // it internally checks if the remote description has been set
                    break;

                case "iceCandidates": // received when trickle ice is NOT used (see the "call" request)
                    var candidates = JSON.parse(msg.data);
                    for (var i = 0; candidates && i < candidates.length; i++) {
                        var elt = candidates[i];
                        let candidate = new RTCIceCandidate({sdpMLineIndex: elt.sdpMLineIndex, candidate: elt.candidate});
                        iceCandidates.push(candidate);
                    }
                    addIceCandidates();
                    break;
            }
        };

        ws.onclose = function (event) {
            console.log('socket closed with code: ' + event.code);
            if (rtcPeerConnection) {
                rtcPeerConnection.close();
                rtcPeerConnection = null;
                ws = null;
            }
            if (onClose) {
                onClose();
            }
        };

        ws.onerror = function (event) {
            onError("An error has occurred on the websocket (make sure the address is correct)!");
        };

        

        return ws;
    }
}
