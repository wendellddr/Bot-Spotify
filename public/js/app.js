// Application state
let socket = null;
let currentGuildId = null;
let updateInterval = null;
let searchResults = [];

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
    loadingOverlay: document.getElementById('loadingOverlay'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    clearBtn: document.getElementById('clearBtn'),
    volumeBtn: document.getElementById('volumeBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeSliderContainer: document.getElementById('volumeSliderContainer'),
    volumeValue: document.getElementById('volumeValue'),
    volumeIcon: document.getElementById('volumeIcon'),
    volumeText: document.getElementById('volumeText'),
    autocompleteContainer: document.getElementById('autocompleteContainer'),
    processingIndicator: document.getElementById('processingIndicator')
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
        
        // Lidar com diferentes tipos de atualização
        if (data.action === 'processing') {
            showProcessingIndicator(data.track || 'song');
            showToast(`Processing "${data.track || 'song'}"...`, 'info');
        } else if (data.action === 'added') {
            hideProcessingIndicator();
            showToast(`"${data.track}" added to queue!`, 'success');
            fetchStatus(); // Atualizar status da fila
        } else if (data.action === 'error') {
            hideProcessingIndicator();
            showToast(data.error || 'Error processing track', 'error');
        } else {
            // Atualização genérica da fila
            fetchStatus();
        }
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
    elements.shuffleBtn.disabled = !hasQueue || status.queue.length < 2;
    elements.clearBtn.disabled = !hasQueue;
    elements.previousBtn.disabled = true; // Previous not implemented yet
    
    // Update play/pause button
    const playIcon = isPlaying ? 'fa-pause' : 'fa-play';
    elements.playPauseBtn.innerHTML = `<i class="fas ${playIcon}"></i>`;
    
    // Show/hide now playing banner
    if (status.currentTrack && elements.nowPlayingContainer) {
        elements.nowPlayingContainer.style.display = 'block';
        if (elements.trackTitle) {
            elements.trackTitle.textContent = status.currentTrack.title || 'Unknown';
        }
        if (elements.trackArtist) {
            elements.trackArtist.textContent = status.currentTrack.author || 'Unknown';
        }
        
        if (elements.trackThumbnail) {
            if (status.currentTrack.thumbnail) {
                elements.trackThumbnail.innerHTML = `<img src="${status.currentTrack.thumbnail}" alt="${status.currentTrack.title || 'Track'}" />`;
            } else {
                elements.trackThumbnail.innerHTML = '<i class="fas fa-music"></i>';
            }
        }
        
        if (elements.totalTime) {
            elements.totalTime.textContent = formatTime(status.currentTrack.duration);
        }
        if (elements.currentTime) {
            elements.currentTime.textContent = '0:00';
        }
    } else if (elements.nowPlayingContainer) {
        elements.nowPlayingContainer.style.display = 'none';
    }
    
    // Update queue
    elements.queueCount.textContent = hasQueue ? status.queue.length : 0;
    
    // Update volume display if slider is visible or initialize it
    if (status.volume !== undefined) {
        if (elements.volumeSliderContainer.style.display !== 'none') {
            updateVolumeDisplay(status.volume);
        } else {
            // Apenas atualizar o slider value sem mostrar (para quando abrir)
            elements.volumeSlider.value = status.volume;
            updateVolumeDisplay(status.volume);
        }
    }
    
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
    elements.searchInput.addEventListener('keydown', (e) => {
        // Navegação por teclado no autocomplete
        if (elements.autocompleteContainer.style.display !== 'none' && currentSuggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, currentSuggestions.length - 1);
                updateAutocompleteSelection();
                // Scroll para item selecionado
                const items = elements.autocompleteContainer.querySelectorAll('.autocomplete-item');
                if (items[selectedAutocompleteIndex]) {
                    items[selectedAutocompleteIndex].scrollIntoView({ block: 'nearest' });
                }
                return;
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, -1);
                updateAutocompleteSelection();
                // Scroll para item selecionado
                if (selectedAutocompleteIndex >= 0) {
                    const items = elements.autocompleteContainer.querySelectorAll('.autocomplete-item');
                    if (items[selectedAutocompleteIndex]) {
                        items[selectedAutocompleteIndex].scrollIntoView({ block: 'nearest' });
                    }
                }
                return;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedAutocompleteIndex >= 0) {
                    selectAutocompleteSuggestion(selectedAutocompleteIndex);
                } else {
                    hideAutocomplete();
                    searchMusic();
                }
                return;
            } else if (e.key === 'Escape') {
                hideAutocomplete();
                return;
            }
        }
        
        // Enter normal (sem autocomplete visível)
        if (e.key === 'Enter') {
            hideAutocomplete();
            searchMusic();
        }
    });
    
    // Autocomplete enquanto digita
    let autocompleteTimeout = null;
    elements.searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        
        // Limpar timeout anterior
        if (autocompleteTimeout) {
            clearTimeout(autocompleteTimeout);
        }
        
        // Se muito curto, mostrar histórico
        if (query.length < 2) {
            showSearchHistory();
            return;
        }
        
        // Esconder histórico e mostrar autocomplete
        hideSearchHistory();
        
        // Debounce: esperar 300ms após parar de digitar
        autocompleteTimeout = setTimeout(() => {
            fetchAutocomplete(query);
        }, 300);
    });
    
    // Mostrar histórico quando focar no input vazio
    elements.searchInput.addEventListener('focus', () => {
        if (elements.searchInput.value.trim().length < 2) {
            showSearchHistory();
        }
    });
    
    // Esconder autocomplete ao clicar fora
    document.addEventListener('click', (e) => {
        if (!elements.searchInput.contains(e.target) && 
            !elements.autocompleteContainer.contains(e.target)) {
            hideAutocomplete();
        }
    });
    
    // Shuffle
    elements.shuffleBtn.addEventListener('click', async () => {
        if (!currentGuildId) return;
        
        try {
            const response = await fetch(`/api/shuffle/${currentGuildId}`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                showToast('Queue shuffled!', 'success');
                fetchStatus();
            } else {
                showToast(data.error || 'Error shuffling', 'error');
            }
        } catch (error) {
            showToast('Error shuffling', 'error');
        }
    });
    
    // Clear
    elements.clearBtn.addEventListener('click', async () => {
        if (!currentGuildId) return;
        
        if (!confirm('Are you sure you want to clear the queue?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/clear/${currentGuildId}`, {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.success) {
                showToast(data.message, 'success');
                fetchStatus();
            } else {
                showToast(data.error || 'Error clearing', 'error');
            }
        } catch (error) {
            showToast('Error clearing', 'error');
        }
    });
    
    // Volume - Toggle slider
    elements.volumeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = elements.volumeSliderContainer.style.display !== 'none';
        if (isVisible) {
            hideVolumeSlider();
        } else {
            showVolumeSlider();
        }
    });
    
    // Volume slider change
    elements.volumeSlider.addEventListener('input', (e) => {
        const volume = parseInt(e.target.value);
        updateVolumeDisplay(volume);
        // Debounce para não fazer muitas requisições
        clearTimeout(window.volumeTimeout);
        window.volumeTimeout = setTimeout(() => {
            setVolume(volume);
        }, 150);
    });
    
    // Esconder slider ao clicar fora
    document.addEventListener('click', (e) => {
        if (!elements.volumeBtn.contains(e.target)) {
            hideVolumeSlider();
        }
    });
    
    // Carregar volume atual ao carregar status
}

// Volume functions
function showVolumeSlider() {
    elements.volumeSliderContainer.style.display = 'block';
    // Carregar volume atual
    fetchCurrentVolume();
}

function hideVolumeSlider() {
    elements.volumeSliderContainer.style.display = 'none';
}

function updateVolumeDisplay(volume) {
    elements.volumeValue.textContent = `${volume}%`;
    elements.volumeSlider.value = volume;
    
    // Atualizar ícone baseado no volume
    elements.volumeIcon.className = 'fas ';
    if (volume === 0) {
        elements.volumeIcon.className += 'fa-volume-mute';
    } else if (volume < 33) {
        elements.volumeIcon.className += 'fa-volume-down';
    } else if (volume < 66) {
        elements.volumeIcon.className += 'fa-volume';
    } else {
        elements.volumeIcon.className += 'fa-volume-up';
    }
}

async function fetchCurrentVolume() {
    if (!currentGuildId) return;
    
    try {
        const response = await fetch(`/api/status/${currentGuildId}`);
        const data = await response.json();
        
        if (data.success && data.volume !== undefined) {
            const volume = data.volume || 50;
            updateVolumeDisplay(volume);
        }
    } catch (error) {
        console.error('Error fetching volume:', error);
    }
}

// Set volume
async function setVolume(volume) {
    if (!currentGuildId) return;
    
    try {
        const response = await fetch(`/api/volume/${currentGuildId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ volume })
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateVolumeDisplay(volume);
            // Não mostrar toast para cada mudança (muito spam)
            // showToast(`Volume: ${volume}%`, 'success');
        } else {
            showToast(data.error || 'Error setting volume', 'error');
        }
    } catch (error) {
        showToast('Error setting volume', 'error');
    }
}

// Search history functions
function saveSearchHistory(query) {
    try {
        let history = JSON.parse(localStorage.getItem('searchHistory') || '[]');
        // Remover duplicatas
        history = history.filter(item => item !== query);
        // Adicionar no início
        history.unshift(query);
        // Limitar a 20 itens
        history = history.slice(0, 20);
        localStorage.setItem('searchHistory', JSON.stringify(history));
    } catch (error) {
        console.error('Error saving search history:', error);
    }
}

function getSearchHistory() {
    try {
        return JSON.parse(localStorage.getItem('searchHistory') || '[]');
    } catch (error) {
        return [];
    }
}

// Search music
async function searchMusic() {
    const query = elements.searchInput.value.trim();
    
    // Validação e sanitização
    if (!query) {
        showToast('Enter a song name', 'warning');
        return;
    }
    
    if (query.length > 200) {
        showToast('Search query too long (max 200 characters)', 'warning');
        return;
    }
    
    if (!currentGuildId) {
        showToast('Select a server first', 'warning');
        return;
    }
    
    // Salvar no histórico
    saveSearchHistory(query);
    
    try {
        showLoading();
        
        const response = await fetch(`/api/search/${currentGuildId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query: query.substring(0, 200) }) // Limitar tamanho
        });
        
        if (response.status === 429) {
            showToast('Too many requests. Please wait a moment.', 'warning');
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.tracks) {
            searchResults = data.tracks;
            displaySearchResults(data.tracks);
            showToast(`Found ${data.tracks.length} results`, 'success');
        } else {
            showToast(data.error || 'No results found', 'warning');
        }
    } catch (error) {
        console.error('Search error:', error);
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
        // Mostrar toast de processamento (não bloqueia o UI)
        showToast(`Adding "${track.title}" to queue...`, 'info');
        
        // Fazer requisição (não bloquear UI)
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
            // Se está processando em background, mostrar mensagem
            if (data.processing) {
                showToast(`Processing "${track.title}"...`, 'info');
            } else {
                showToast(`"${track.title}" added to queue!`, 'success');
                fetchStatus();
            }
            
            // Limpar busca e mostrar interface principal imediatamente
            elements.searchInput.value = '';
            elements.searchResultsContainer.style.display = 'none';
            elements.mainDisplay.style.display = 'block';
            
            // Atualizar status após um pequeno delay (para dar tempo do processamento)
            setTimeout(() => {
                fetchStatus();
            }, 1000);
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
        console.error('Error playing song:', error);
        showToast('Error playing song', 'error');
    }
    // Não usar finally com hideLoading - deixar o UI livre
}

// Autocomplete functions
let currentSuggestions = [];

async function fetchAutocomplete(query) {
    if (!currentGuildId) {
        return;
    }
    
    // Verificar cache
    const cacheKey = query.toLowerCase().trim();
    const cached = autocompleteCache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
        if (cached.suggestions.length > 0) {
            currentSuggestions = cached.suggestions;
            displayAutocomplete(cached.suggestions);
        } else {
            hideAutocomplete();
        }
        return;
    }
    
    try {
        const response = await fetch(`/api/autocomplete/${currentGuildId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });
        
        if (response.status === 429) {
            // Rate limit - usar cache se disponível
            if (cached) {
                if (cached.suggestions.length > 0) {
                    currentSuggestions = cached.suggestions;
                    displayAutocomplete(cached.suggestions);
                }
            }
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.suggestions && data.suggestions.length > 0) {
            currentSuggestions = data.suggestions;
            // Salvar no cache
            autocompleteCache.set(cacheKey, {
                suggestions: data.suggestions,
                expiry: Date.now() + AUTCOMPLETE_CACHE_TTL
            });
            displayAutocomplete(data.suggestions);
        } else {
            // Cache também resultado vazio
            autocompleteCache.set(cacheKey, {
                suggestions: [],
                expiry: Date.now() + AUTCOMPLETE_CACHE_TTL
            });
            hideAutocomplete();
        }
    } catch (error) {
        console.error('Autocomplete error:', error);
        // Tentar usar cache em caso de erro
        if (cached && cached.suggestions.length > 0) {
            currentSuggestions = cached.suggestions;
            displayAutocomplete(cached.suggestions);
        } else {
            hideAutocomplete();
        }
    }
}

function displayAutocomplete(suggestions) {
    if (!elements.autocompleteContainer) return;
    
    selectedAutocompleteIndex = -1;
    hideSearchHistory();
    
    // Criar container de sugestões se não existir
    let suggestionsDiv = elements.autocompleteContainer.querySelector('.autocomplete-suggestions');
    if (!suggestionsDiv) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.className = 'autocomplete-suggestions';
        elements.autocompleteContainer.appendChild(suggestionsDiv);
    }
    
    suggestionsDiv.innerHTML = suggestions.map((suggestion, index) => `
        <div class="autocomplete-item" data-index="${index}">
            <i class="fas fa-music"></i>
            <div class="autocomplete-item-info">
                <div class="autocomplete-item-title">${escapeHtml(suggestion.title)}</div>
                <div class="autocomplete-item-artist">${escapeHtml(suggestion.artist)}</div>
            </div>
        </div>
    `).join('');
    
    elements.autocompleteContainer.style.display = 'block';
    
    // Adicionar listeners de clique
    suggestionsDiv.querySelectorAll('.autocomplete-item').forEach((item, index) => {
        item.addEventListener('click', () => {
            selectAutocompleteSuggestion(index);
        });
        
        item.addEventListener('mouseenter', () => {
            selectedAutocompleteIndex = index;
            updateAutocompleteSelection();
        });
        
        item.addEventListener('mouseleave', () => {
            // Não remover seleção ao sair com mouse
        });
    });
}

function updateAutocompleteSelection() {
    const items = elements.autocompleteContainer.querySelectorAll('.autocomplete-item');
    items.forEach((item, index) => {
        if (index === selectedAutocompleteIndex) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

function selectAutocompleteSuggestion(index) {
    if (index >= 0 && index < currentSuggestions.length) {
        const suggestion = currentSuggestions[index];
        // Salvar no histórico
        saveSearchHistory(suggestion.fullQuery);
        elements.searchInput.value = suggestion.fullQuery;
        hideAutocomplete();
        searchMusic();
    }
}

function hideAutocomplete() {
    if (elements.autocompleteContainer) {
        elements.autocompleteContainer.style.display = 'none';
        const suggestionsDiv = elements.autocompleteContainer.querySelector('.autocomplete-suggestions');
        if (suggestionsDiv) {
            suggestionsDiv.innerHTML = '';
        }
        currentSuggestions = [];
        selectedAutocompleteIndex = -1;
    }
    hideSearchHistory();
}

function showSearchHistory() {
    const history = getSearchHistory();
    if (history.length === 0) return;
    
    if (!elements.autocompleteContainer) return;
    
    // Criar container de histórico se não existir
    let historyContainer = document.getElementById('searchHistoryContainer');
    if (!historyContainer) {
        historyContainer = document.createElement('div');
        historyContainer.id = 'searchHistoryContainer';
        historyContainer.className = 'search-history-container';
        elements.autocompleteContainer.appendChild(historyContainer);
    }
    
    historyContainer.innerHTML = `
        <div class="search-history-header">Recent searches</div>
        <div class="search-history-list">
            ${history.map((item, index) => `
                <div class="search-history-item" data-query="${escapeHtml(item)}">
                    <i class="fas fa-clock"></i>
                    <span>${escapeHtml(item)}</span>
                    <i class="fas fa-times remove-history" data-index="${index}"></i>
                </div>
            `).join('')}
        </div>
    `;
    
    historyContainer.style.display = 'block';
    elements.autocompleteContainer.style.display = 'block';
    
    // Adicionar listeners
    historyContainer.querySelectorAll('.search-history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-history')) {
                const query = item.dataset.query;
                elements.searchInput.value = query;
                hideAutocomplete();
                searchMusic();
            }
        });
    });
    
    historyContainer.querySelectorAll('.remove-history').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            removeSearchHistory(index);
            showSearchHistory();
        });
    });
}

function hideSearchHistory() {
    const historyContainer = document.getElementById('searchHistoryContainer');
    if (historyContainer) {
        historyContainer.style.display = 'none';
    }
}

function removeSearchHistory(index) {
    try {
        let history = getSearchHistory();
        history.splice(index, 1);
        localStorage.setItem('searchHistory', JSON.stringify(history));
    } catch (error) {
        console.error('Error removing search history:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utilities
function formatTime(duration) {
    if (!duration) return '0:00';
    
    // Se já for uma string no formato "MM:SS" ou "HH:MM:SS", retornar como está
    if (typeof duration === 'string' && duration.includes(':')) {
        return duration;
    }
    
    // Se for número, assumir que é em milissegundos
    let ms = duration;
    if (typeof duration === 'number') {
        ms = duration;
    } else if (typeof duration === 'string') {
        // Tentar converter string para número
        ms = parseFloat(duration);
        if (isNaN(ms)) return '0:00';
        // Se for um número pequeno (< 10000), assumir que está em segundos
        if (ms < 10000) {
            ms = ms * 1000;
        }
    }
    
    // Verificar se é válido
    if (isNaN(ms) || ms <= 0) return '0:00';
    
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
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

function showProcessingIndicator(trackName = 'song') {
    if (elements.processingIndicator) {
        elements.processingIndicator.querySelector('span').textContent = `Processing "${trackName}"...`;
        elements.processingIndicator.style.display = 'flex';
    }
}

function hideProcessingIndicator() {
    if (elements.processingIndicator) {
        elements.processingIndicator.style.display = 'none';
    }
}
