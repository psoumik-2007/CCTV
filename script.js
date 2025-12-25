// ==================== ESP32-CAM STREAM VIEWER - JAVASCRIPT ====================
// Stream management, auto-reconnect, and status monitoring

// Configuration
const CONFIG_KEY = 'esp32cam_config';
let streamUrl = null;
let isStreamActive = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectDelay = 2000; // Initial delay in ms
let fps = 0;
let frameCount = 0;
let lastFrameTime = Date.now();
let startTime = Date.now();
let heartbeatInterval = null;
let fpsInterval = null;

// DOM Elements
const streamImage = document.getElementById('streamImage');
const placeholder = document.getElementById('placeholder');
const statusBadge = document.getElementById('statusBadge');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const configForm = document.getElementById('configForm');
const cameraIPInput = document.getElementById('cameraIP');
const streamTokenInput = document.getElementById('streamToken');
const streamPortInput = document.getElementById('streamPort');
const refreshBtn = document.getElementById('refreshBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const streamUrlDisplay = document.getElementById('streamUrl');
const urlDisplay = document.getElementById('urlDisplay');
const fpsCounter = document.getElementById('fpsCounter');
const timestamp = document.getElementById('timestamp');
const uptimeDisplay = document.getElementById('uptime');

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 ESP32-CAM Stream Viewer initialized');
    
    // Load saved configuration
    loadConfig();
    
    // Setup event listeners
    configForm.addEventListener('submit', handleConfigSubmit);
    refreshBtn.addEventListener('click', refreshStream);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    streamImage.addEventListener('load', handleImageLoad);
    streamImage.addEventListener('error', handleImageError);
    
    // Start uptime counter
    setInterval(updateUptime, 1000);
    
    // Start FPS counter
    fpsInterval = setInterval(updateFPS, 1000);
    
    console.log('✓ Event listeners attached');
});

// ==================== CONFIGURATION MANAGEMENT ====================
function loadConfig() {
    const savedConfig = localStorage.getItem(CONFIG_KEY);
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            cameraIPInput.value = config.ip || '';
            streamTokenInput.value = config.token || '';
            streamPortInput.value = config.port || '80';
            
            console.log('✓ Configuration loaded from storage');
            
            // Auto-connect if config exists
            if (config.ip && config.token) {
                setTimeout(() => {
                    connectToStream(config.ip, config.token, config.port);
                }, 500);
            }
        } catch (e) {
            console.error('Failed to load config:', e);
        }
    }
}

function saveConfig(ip, token, port) {
    const config = { ip, token, port };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    console.log('✓ Configuration saved');
}

function handleConfigSubmit(e) {
    e.preventDefault();
    
    const ip = cameraIPInput.value.trim();
    const token = streamTokenInput.value.trim();
    const port = streamPortInput.value.trim() || '80';
    
    if (!ip || !token) {
        updateStatus('offline', 'Invalid configuration');
        return;
    }
    
    // Save configuration
    saveConfig(ip, token, port);
    
    // Connect to stream
    connectToStream(ip, token, port);
}

// ==================== STREAM CONNECTION ====================
function connectToStream(ip, token, port) {
    // Build stream URL
    streamUrl = `http://${ip}:${port}/stream?token=${encodeURIComponent(token)}`;
    
    console.log('🔗 Connecting to stream:', streamUrl);
    
    // Update UI
    urlDisplay.textContent = streamUrl;
    streamUrlDisplay.style.display = 'block';
    
    // Update status
    updateStatus('connecting', 'Connecting...');
    
    // Reset reconnect attempts
    reconnectAttempts = 0;
    
    // Start stream
    startStream();
}

function startStream() {
    // Hide placeholder, show image
    placeholder.style.display = 'none';
    streamImage.style.display = 'block';
    
    // Set image source (this triggers MJPEG streaming)
    streamImage.src = streamUrl + '&t=' + Date.now(); // Add timestamp to prevent caching
    
    // Start heartbeat monitoring
    startHeartbeat();
}

function stopStream() {
    isStreamActive = false;
    streamImage.src = '';
    streamImage.style.display = 'none';
    placeholder.style.display = 'flex';
    
    // Stop heartbeat
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    
    // Reset FPS
    fps = 0;
    frameCount = 0;
    fpsCounter.textContent = '-- FPS';
}

function refreshStream() {
    console.log('🔄 Refreshing stream...');
    
    if (streamUrl) {
        stopStream();
        setTimeout(() => {
            startStream();
        }, 500);
    } else {
        alert('Please configure the stream first');
    }
}

// ==================== HEARTBEAT & AUTO-RECONNECT ====================
function startHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(() => {
        checkStreamHealth();
    }, 5000); // Check every 5 seconds
}

function checkStreamHealth() {
    // If no frames received in the last 5 seconds, consider stream dead
    const timeSinceLastFrame = Date.now() - lastFrameTime;
    
    if (timeSinceLastFrame > 5000 && isStreamActive) {
        console.warn('⚠️ Stream appears to be frozen');
        handleStreamFailure();
    }
}

function handleStreamFailure() {
    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1); // Exponential backoff
        
        console.log(`🔄 Reconnecting (attempt ${reconnectAttempts}/${maxReconnectAttempts}) in ${delay}ms...`);
        updateStatus('connecting', `Reconnecting (${reconnectAttempts}/${maxReconnectAttempts})...`);
        
        setTimeout(() => {
            refreshStream();
        }, delay);
    } else {
        console.error('❌ Max reconnect attempts reached');
        updateStatus('offline', 'Connection failed');
        stopStream();
        
        // Reset after 30 seconds
        setTimeout(() => {
            reconnectAttempts = 0;
        }, 30000);
    }
}

// ==================== IMAGE EVENT HANDLERS ====================
function handleImageLoad() {
    if (!isStreamActive) {
        isStreamActive = true;
        updateStatus('online', 'Stream Active');
        reconnectAttempts = 0; // Reset on successful connection
        console.log('✓ Stream connected successfully');
    }
    
    // Update frame count and FPS
    frameCount++;
    lastFrameTime = Date.now();
}

function handleImageError(e) {
    console.error('❌ Stream error:', e);
    isStreamActive = false;
    updateStatus('offline', 'Connection lost');
    
    // Attempt to reconnect
    handleStreamFailure();
}

// ==================== FPS CALCULATION ====================
function updateFPS() {
    fps = frameCount;
    frameCount = 0;
    
    if (fps > 0) {
        fpsCounter.textContent = `${fps} FPS`;
    } else {
        fpsCounter.textContent = '-- FPS';
    }
}

// ==================== STATUS UPDATES ====================
function updateStatus(status, message) {
    // Update status dot
    statusDot.className = `status-dot ${status}`;
    
    // Update status text
    statusText.textContent = message;
    
    // Update badge class for styling
    statusBadge.className = `status-badge ${status}`;
}

// ==================== TIMESTAMP UPDATE ====================
setInterval(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    timestamp.textContent = `${hours}:${minutes}:${seconds}`;
}, 1000);

// ==================== UPTIME COUNTER ====================
function updateUptime() {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;
    
    if (hours > 0) {
        uptimeDisplay.textContent = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        uptimeDisplay.textContent = `${minutes}m ${seconds}s`;
    } else {
        uptimeDisplay.textContent = `${seconds}s`;
    }
}

// ==================== FULLSCREEN ====================
function toggleFullscreen() {
    const container = document.getElementById('streamContainer');
    
    if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => {
            console.error('Fullscreen error:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// ==================== UTILITY FUNCTIONS ====================
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = {
        info: 'ℹ️',
        success: '✓',
        warning: '⚠️',
        error: '❌'
    }[type] || 'ℹ️';
    
    console.log(`[${timestamp}] ${prefix} ${message}`);
}

// ==================== ERROR HANDLING ====================
window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});

// ==================== NETWORK STATUS MONITORING ====================
window.addEventListener('online', () => {
    console.log('✓ Network connection restored');
    if (streamUrl && !isStreamActive) {
        setTimeout(refreshStream, 1000);
    }
});

window.addEventListener('offline', () => {
    console.warn('⚠️ Network connection lost');
    updateStatus('offline', 'No internet connection');
});

// ==================== EXPORTS FOR DEBUGGING ====================
window.ESP32CAM = {
    getStreamUrl: () => streamUrl,
    getStatus: () => ({
        active: isStreamActive,
        fps: fps,
        reconnectAttempts: reconnectAttempts
    }),
    refreshStream: refreshStream,
    stopStream: stopStream
};

console.log('✓ ESP32-CAM Stream Viewer ready');
console.log('Debug: Access window.ESP32CAM for debugging functions');
