// Application state
let socket = null;
let currentGuildId = null;
let updateInterval = null;
let searchResults = [];
let searchDebounceTimer = null; // Debounce search requests

// DOM elements
const elements = {
    serverSelect: document.getElementById('serverSelect'),
    logoutBtn: document.getElementById('logoutBtn'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    skipBtn: document.getElementById('skipBtn'),
    stopBtn: document.getElementById('stopBtn'),
    previousBtn: document.getElementById('previousBtn'),
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    voiceChannelSelector: document.getElementById('voiceChannelSelector'),
    voiceChannelSelect: document.getElementById('voiceChannelSelect'),
    searchResults: document.getElementById('searchResults'),
    searchResultsContainer: document.getElementById('searchResultsContainer'),
    mainDisplay: document.getElementById('mainDisplay'),
    nowPlayingContainer: document.getElementById('nowPlayingContainer'),
    trackTitle: document.getElementById('trackTitle'),
    trackArtist: document.getElementById('trackArtist'),
    trackThumbnail: document.getElementById('trackThumbnail'),
    progressFill: document.getElementById('progressFill'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    queueList: document.getElementById('queueList'),
    queueCount: document.getElementById('queueCount'),
    loadingOverlay: document.getElementById('loadingOverlay')
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    loadServers();
    attachEventListeners();
});

// Initialize WebSocket
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('✅ Connected to WebSocket server');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected from WebSocket server');
    });
    
    socket.on('queueUpdate', (data) => {
        console.log('📊 Queue update:', data);
        fetchStatus();
    });
    
    socket.on('playerUpdate', (data) => {
        console.log('🎵 Player update:', data);
        fetchStatus();
    });
}

// Load servers
async function loadServers() {
    try {
        showLoading();
        const response = await fetch('/api/servers');
        const data = await response.json();
        
        if (data.success) {
            elements.serverSelect.innerHTML = '<option value="">Select a server...</option>';
            
            data.servers.forEach(server => {
                const option = document.createElement('option');
                option.value = server.id;
                option.textContent = server.name;
                elements.serverSelect.appendChild(option);
            });
            
            if (data.servers.length > 0) {
                elements.serverSelect.disabled = false;
            }
        }
    } catch (error) {
        showToast('Error loading servers', 'error');
    } finally {
        hideLoading();
    }
}

// Load voice channels
async function loadVoiceChannels(guildId) {
    try {
        const response = await fetch(`/api/voice-channels/${guildId}`);
        const data = await response.json();
        
        if (data.success && data.channels.length > 0) {
            elements.voiceChannelSelect.innerHTML = '<option value="">Choose a channel...</option>';
            
            data.channels.forEach(channel => {
                const option = document.createElement('option');
                option.value = channel.id;
                option.textContent = `${channel.name} (${channel.userCount} users)`;
                elements.voiceChannelSelect.appendChild(option);
            });
            
            elements.voiceChannelSelector.style.display = 'block';
        } else {
            elements.voiceChannelSelector.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading voice channels:', error);
        elements.voiceChannelSelector.style.display = 'none';
    }
}

// Load status of selected server
async function fetchStatus() {
    if (!currentGuildId) return;
    
    try {
        const response = await fetch(`/api/status/${currentGuildId}`);
        const data = await response.json();
        
        if (data.success) {
            updateUI(data.status);
        }
    } catch (error) {
        console.error('Error fetching status:', error);
    }
}

// Update interface
function updateUI(status) {
    const hasQueue = status.queue && status.queue.length > 0;
    const isPlaying = status.isPlaying || false;
    
    // Update buttons - enable play/pause if we have a queue
    elements.playPauseBtn.disabled = !hasQueue;
    elements.skipBtn.disabled = !hasQueue;
    elements.stopBtn.disabled = !hasQueue;
    elements.previousBtn.disabled = true; // Previous not implemented yet
    
    // Update play/pause button
    const playIcon = isPlaying ? 'fa-pause' : 'fa-play';
    elements.playPauseBtn.innerHTML = `<i class="fas ${playIcon}"></i>`;
    
    // Show/hide now playing banner
    if (status.currentTrack) {
        elements.nowPlayingContainer.style.display = 'block';
        elements.trackTitle.textContent = status.currentTrack.title;
        elements.trackArtist.textContent = status.currentTrack.author || 'Unknown';
        
        if (status.currentTrack.thumbnail) {
            elements.trackThumbnail.innerHTML = `<img src="${status.currentTrack.thumbnail}" alt="${status.currentTrack.title}" />`;
        } else {
            elements.trackThumbnail.innerHTML = '<i class="fas fa-music"></i>';
        }
        
        elements.totalTime.textContent = formatTime(status.currentTrack.duration);
        elements.currentTime.textContent = '0:00';
    } else {
        elements.nowPlayingContainer.style.display = 'none';
    }
    
    // Update queue
    elements.queueCount.textContent = hasQueue ? status.queue.length : 0;
    
    if (hasQueue) {
        elements.queueList.innerHTML = status.queue.map((track, index) => `
            <div class="queue-item" data-index="${index}">
                <img src="${track.thumbnail || ''}" alt="${track.title}" onerror="this.style.display='none'" />
                <div class="queue-item-info">
                    <h4>${track.title}</h4>
                    <p>${track.author || 'Unknown'}</p>
                </div>
            </div>
        `).join('');
    } else {
        elements.queueList.innerHTML = `
            <div class="empty-queue-spotify">
                <i class="fas fa-music"></i>
                <p>Your queue is empty</p>
                <span>Search for songs to add to your queue</span>
            </div>
        `;
    }
}

// Event Listeners
function attachEventListeners() {
    // Server selection
    elements.serverSelect.addEventListener('change', (e) => {
        const guildId = e.target.value;
        if (guildId) {
            currentGuildId = guildId;
            socket.emit('subscribe', guildId);
            fetchStatus();
            loadVoiceChannels(guildId);
            
            // Auto-refresh every 5 seconds
            if (updateInterval) clearInterval(updateInterval);
            updateInterval = setInterval(fetchStatus, 5000);
        } else {
            currentGuildId = null;
            if (updateInterval) clearInterval(updateInterval);
        }
    });
    
    // Logout
    elements.logoutBtn.addEventListener('click', () => {
        window.location.href = '/logout';
    });
    
    // Play/Pause
    elements.playPauseBtn.addEventListener('click', async () => {
        if (!currentGuildId) return;
        
        try {
            const response = await fetch(`/api/toggle/${currentGuildId}`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                showToast(data.message, 'success');
                fetchStatus();
            }
        } catch (error) {
            showToast('Error pausing/resuming', 'error');
        }
    });
    
    // Skip
    elements.skipBtn.addEventListener('click', async () => {
        if (!currentGuildId) return;
        
        try {
            const response = await fetch(`/api/skip/${currentGuildId}`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                showToast('Song skipped', 'success');
                fetchStatus();
            }
        } catch (error) {
            showToast('Error skipping song', 'error');
        }
    });
    
    // Stop
    elements.stopBtn.addEventListener('click', async () => {
        if (!currentGuildId) return;
        
        if (!confirm('Are you sure you want to stop playback?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/stop/${currentGuildId}`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                showToast('Playback stopped', 'success');
                fetchStatus();
            }
        } catch (error) {
            showToast('Error stopping', 'error');
        }
    });
    
    // Search
    elements.searchBtn.addEventListener('click', searchMusic);
    elements.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchMusic();
        }
    });
}

// Search music
async function searchMusic() {
    const query = elements.searchInput.value.trim();
    
    if (!query) {
        showToast('Enter a song name', 'warning');
        return;
    }
    
    if (!currentGuildId) {
        showToast('Select a server first', 'warning');
        return;
    }
    
    try {
        showLoading();
        const response = await fetch(`/api/search/${currentGuildId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        
        if (data.success && data.tracks) {
            searchResults = data.tracks;
            displaySearchResults(data.tracks);
            showToast(`Found ${data.tracks.length} results`, 'success');
        } else {
            showToast(data.error || 'No results found', 'warning');
        }
    } catch (error) {
        showToast('Error searching', 'error');
    } finally {
        hideLoading();
    }
}

// Display search results
function displaySearchResults(tracks) {
    if (tracks.length === 0) {
        elements.searchResultsContainer.style.display = 'none';
        elements.mainDisplay.style.display = 'block';
        return;
    }
    
    elements.mainDisplay.style.display = 'none';
    elements.searchResultsContainer.style.display = 'block';
    elements.searchResults.innerHTML = tracks.map((track, index) => `
        <div class="result-item" data-index="${index}">
            <img src="${track.thumbnail || ''}" alt="${track.title}" onerror="this.style.display='none'" />
            <div class="result-item-info">
                <h4>${track.title}</h4>
                <p>${track.author}</p>
            </div>
            <div class="result-item-duration">${formatTime(track.duration)}</div>
        </div>
    `).join('');
    
    // Add click listeners
    elements.searchResults.querySelectorAll('.result-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            playTrack(searchResults[index]);
        });
    });
}

// Play track
async function playTrack(track) {
    if (!currentGuildId) {
        showToast('Select a server first', 'warning');
        return;
    }
    
    // Check if voice channel is required
    const voiceChannelId = elements.voiceChannelSelect.value;
    const needsChannel = elements.voiceChannelSelector.style.display !== 'none';
    if (needsChannel && !voiceChannelId) {
        showToast('Please select a voice channel first', 'warning');
        return;
    }
    
    try {
        showLoading();
        const response = await fetch(`/api/play/${currentGuildId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                trackUrl: track.url,
                trackTitle: track.title,
                trackArtist: track.author,
                voiceChannelId: voiceChannelId || null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('Song added to queue!', 'success');
            elements.searchInput.value = '';
            elements.searchResultsContainer.style.display = 'none';
            elements.mainDisplay.style.display = 'block';
            fetchStatus();
        } else {
            if (data.requiresVoiceChannel) {
                elements.voiceChannelSelector.style.display = 'block';
                loadVoiceChannels(currentGuildId);
                showToast('Please select a voice channel', 'warning');
            } else {
                showToast(data.error || 'Error adding song', 'error');
            }
        }
    } catch (error) {
        showToast('Error playing song', 'error');
    } finally {
        hideLoading();
    }
}

// Utilities
function formatTime(ms) {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    const container = document.getElementById('toastContainer');
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

function showLoading() {
    elements.loadingOverlay.classList.add('active');
}

function hideLoading() {
    elements.loadingOverlay.classList.remove('active');
}
