import Signal from './signalling.js?v=0.0.3';
import './doorpi-camera-view.js?v=0.0.3';

class DoorPiCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.connectionEstablished = false;
        this.connectionEnabled = true;
    }

    set hass(hass) {
        if(this.notYetInitialized()) {
            this.initEventListeners(hass);
            this.getCameraView().hass = hass;
        }
        this.initDoorbellStatus(hass);
        this.initDoorbell(hass);

        if(this.connectionNotInitiated()) {
            this.initiateConnection();
        }
    }

    setConfig(config) {
        // Get stack string
        const stack = new Error().stack.split('at');
        // The component will share the path up to the last slash
        const version = stack[1].substring(stack[1].indexOf('?')+3, stack[1].indexOf('?')+8);

        if (!config.camera_entity) {
            throw new Error('You need to define a camera entity');
        }
        if(!config.doorpi) {
            throw new Error('You need to define the DoorPi settings');
        } else {
            if(!config.doorpi.url) throw new Error('You need to define the DoorPi HTTPS url');
            if(config.doorpi.url.indexOf('https') < 0) throw new Error('You need to define the DoorPi HTTPS url');
        }
        this.config = config;

        const root = this.shadowRoot;
        if (root.lastChild) root.removeChild(root.lastChild);


        const card = document.createElement('ha-card');
        const content = document.createElement('div');
        const style = document.createElement('style');
        style.textContent = `
            ha-card {
                /* sample css */
            }
            .buttons {
                overflow: auto;
                padding: 16px;
                text-align: right;
            }
            .buttons #btn-accept-call, .buttons #btn-reject-call, .buttons #btn-end-call {
                display: none;
            }
            .buttons.doorbell-ringing #btn-accept-call, .buttons.doorbell-ringing #btn-reject-call {
                display: inline-flex;
            }
            .buttons.doorbell-talking #btn-end-call {
                display: inline-flex;
            }
            .ring-buttons {
                float: left;
                background: var(--paper-dialog-background-color, var(--primary-background-color));
                color: var(--paper-dialog-color, var(--primary-text-color));
            }
            mwc-button {
                margin-right: 16px;
            }
            `;
        content.innerHTML = `
        <doorpi-camera-view></doorpi-camera-view>
        <!--div class="version">${version}</div-->
        <div id="buttons" class='buttons'>
            <div class="ring-buttons">
                <mwc-button dense id='bell-on'><ha-icon class="mdc-button__icon" icon="mdi:bell-ring-outline"></ha-icon></mwc-button>
                <mwc-button dense id='bell-off'><ha-icon class="mdc-button__icon" icon="mdi:bell-off-outline"></ha-icon></mwc-button>
            </div>
            <mwc-button raised id='btn-open-door'>` + 'Open Door' + `</mwc-button>
            <mwc-button raised id='btn-accept-call'>` + 'Accept' + `</mwc-button>
            <mwc-button raised id='btn-reject-call'>` + 'Reject' + `</mwc-button>
            <mwc-button raised id='btn-end-call'>` + 'End' + `</mwc-button>
        </div>
        `;
        card.header = ''
        card.appendChild(content);
        card.appendChild(style);
        root.appendChild(card);

        this.getCameraView().setConfig(config);
        this.getCameraView().setOnStop(()=> {
            if(this.signalObj.getConnectionStatus() === 1){
                this.signalObj.closeConnection()
            }
        })
    }

    // The height of your card. Home Assistant uses this to automatically
    // distribute all cards over the available columns.
    getCardSize() {
        return 3;
    }

    notYetInitialized() {
        return !this.signalObj && this.config;
    }

    connectionNotInitiated() {
        return !this.connectionEstablished && this.connectionEnabled;
    }

    initEventListeners(hass) {
        console.log('Loading WebRTC');
        this.signalObj = {};

        this.buttons = this.getElementById('buttons');
        let acceptCallBtn = this.removeEventListeners(this.getElementById('btn-accept-call'));
        let rejectCallBtn = this.removeEventListeners(this.getElementById('btn-reject-call'));
        let endCallBtn = this.removeEventListeners(this.getElementById('btn-end-call'));

        acceptCallBtn.addEventListener('click', () => this.makeCall(hass));
        rejectCallBtn.addEventListener('click',  () => {this.cleanup(hass);});
        endCallBtn.addEventListener('click', () => {
            this.terminateCall();
            this.cleanup(hass);
        });
    }

    initiateConnection() {
        const address = this.config.doorpi.url;
        const wsurl = 'wss://' + address.substring(7, address.length) + ':8888/webrtc';
        const doorpiCard = this;
        
        this.connectionEnabled = false;
        doorpiCard.signalObj = new Signal(wsurl,
            (error) => {
                console.log("Connection error");
                this.connectionEnabled = false;
            },
            () => {
                console.log('websocket closed. bye bye!');
                this.connectionEstablished = false;
                //this.connectionEnabled = true;
            },
            (message) => {}
        );
        this.connectionEstablished = true;
    }

    makeCall(hass) {
        const localConstraints = {};
        const isFirefox = typeof InstallTrigger !== 'undefined';// Firefox 1.0+
        
        localConstraints['audio'] = isFirefox ? {echoCancellation: true} : {optional: [{echoCancellation: true}]};
        if (navigator.mediaDevices) {
            navigator.mediaDevices.getUserMedia(localConstraints)
                .then((stream) => {
                    this.signalObj.call(stream,
                        (doorbellStream) => {
                            console.log('got a stream!');
                            console.log(doorbellStream.getTracks());
                            remoteAudio = document.createElement('audio');
                            remoteAudio.srcObject = doorbellStream;
                            remoteAudio.play();
                            //var url = window.URL || window.webkitURL;
                            //video.srcObject = stream;
                            //video.play();
                        }
                    );
                })
                .catch((error) => {
                    alert("An error has occurred. Check media device, permissions on media and origin.");
                    console.error(error);
                    stop();
                });
        } else {
            console.log("getUserMedia not supported");
        }

        this.buttons.classList.replace('doorbell-ringing', 'doorbell-talking');
        hass.states['input_boolean.doorbell'].state = 'off';
    }

    terminateCall() {
        if (this.signalObj) {
            console.log('Terminating call');
            hass.states['input_boolean.doorbell'].state = 'off';
            this.connectionEnabled = true;
            this.signalObj.hangup();
            //this.signalObj = null;
        }
    }

    initDoorbellStatus(hass) {
        this.setupBellRingingButton(hass, 'on', 'off');
        this.setupBellRingingButton(hass, 'off', 'on');
    }

    initDoorbell(hass) {
        if(hass.states['input_select.doorbell'].state !== 'ring-off')
            if(hass.states['input_boolean.doorbell'].state === 'off') {
                this.buttons.classList.remove('doorbell-ringing', 'doorbell-talking');
            } else if(hass.states['input_boolean.doorbell'].state === 'on' && !this.buttons.classList.contains('doorbell-talking')) {
                this.buttons.classList.add('doorbell-ringing');
            }
    }

    setupBellRingingButton(hass, status, next_status) {
        let btn = this.shadowRoot.querySelector(`#bell-${status}`);

        if(hass.states['input_select.doorbell'].state == `ring-${status}`) {
            btn.style.display = 'inline-flex'; 
        } else {
            btn.style.display = 'none';
        }
        btn.addEventListener('click', () => hass.callService('input_select', 'select_option', { entity_id: 'input_select.doorbell', option: `ring-${next_status}`}));
    }

    cleanup(hass) {
        this.buttons.classList.remove('doorbell-ringing', 'doorbell-talking');
        this.signalObj.hangup();
        setTimeout(() => {
            hass.callService('input_boolean', 'turn_off', { entity_id: 'input_boolean.doorbell' });
            hass.callService('browser_mod', 'close_popup');
            }, 1000);
    }
    
    getCameraView() {
        return this.shadowRoot.querySelector('doorpi-camera-view');
    }

    removeEventListeners(elem) {
        let elemClone = elem.cloneNode(true);
        elem.parentNode.replaceChild(elemClone, elem);
        return elemClone;
    }

    getElementById(id) {
        return this.shadowRoot.querySelector(`#${id}`);
    }
}


customElements.define('doorpi-card', DoorPiCard);
