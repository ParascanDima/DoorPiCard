class DoorPiCameraView extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isStopped = true;
        this.onStop = () => {};
    }

    set hass(hass) {
        this.showCameraView(hass);
    }

    setConfig(config) {
        this.config = config;
     
        const root = this.shadowRoot;
        const content = document.createElement('div');
        content.id = 'cameraview';
        content.innerHTML = `<img style="width: 100%"></img>`;
        content.style.objectFit = 'cover';
        root.appendChild(content);
    }

    setOnStop(onStopHandler){
        this.onStop = onStopHandler;
    }

    showCameraView(hass) {
        if(!this.cameraViewerShownInterval)
            this.cameraViewerShownInterval = window.setInterval(() => this.isDoorPiCameraViewNotShown() , 15000);
        const imgEl = this.getImgElement();
        this.isStopped = false;
        // const camera_entity = this.config.camera_entity;

        // const old_access_token = this.access_token;
        // const new_access_token = hass.states[camera_entity].attributes['access_token'];

        // if(old_access_token !== new_access_token) {
        //     this.access_token = hass.states[camera_entity].attributes['access_token'];
        //     imgEl.src = `/api/camera_proxy_stream/${camera_entity}?token=${this.access_token}`;
        // }
        imgEl.src = this.config.doorpi.url + ':8080/stream/video.mjpeg';
    }

    isDoorPiCameraViewNotShown() {
        const imgEl = this.getImgElement();
        if(!this.isVisible(imgEl) && !this.isStopped) {
            this.stopCameraStreaming();
            this.isStopped = true;
            this.onStop();
        }
    }

    stopCameraStreaming() {
        console.log('Stopping camera stream...');
        const imgEl = this.getImgElement();
        imgEl.src = '';
        this.access_token = undefined;
        clearInterval(this.cameraViewerShownInterval);
        this.cameraViewerShownInterval = null;
    }

    isVisible(el) {
        if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) {
            return false;
        }
        return true;
    }

    getImgElement() {
        return this.shadowRoot.querySelector('#cameraview img');
    }

}
customElements.define('doorpi-camera-view', DoorPiCameraView);
