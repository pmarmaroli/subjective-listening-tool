// const WavesurferTimelinePlugin = WaveSurfer.timeline; // Only if the plugin is attached to the WaveSurfer object
// var WavesurferTimelinePlugin = require("wavesurfer.js/dist/plugin/wavesurfer.regions.min.js");

console.log("Current directory:", window.location.pathname);

let peaksInstance = null;
let audioElement = null;
let analyser = null;
let audioContext = null;
let fftData = null;
let sourceNode;

let tracks = [];
const projectContainer = document.getElementById("project-container");
let projectSelect = document.createElement("select");
const labelSelect = document.createElement("select");
let emptyOption = document.createElement("option");
let folders = [];
const playPauseButton = document.getElementById(`playPauseButton`);

// Audio preloading cache
let audioCache = {}; // Maps URL -> AudioBuffer (decoded)
let blobCache = {}; // Maps URL -> Blob URL (ready to use)
let isPreloading = false;
let isLoadingTrack = false; // Prevent concurrent track loads

let wsRegions = null;
var lines = "";
var parts = "";
var startTime = 0;
var endTime = 0;
var label = "-";
let regionsCreated = false;
let isAdminMode = false;
let spectrumAnalyzerInitialized = false;

// Update password label based on access type selection
document.addEventListener("DOMContentLoaded", async () => {
  // Check if user is already authenticated as admin
  if (sessionStorage.getItem('isAdmin') === 'true') {
    isAdminMode = true;
    document.getElementById("authSection").style.display = "none";
    document.getElementById("mainApp").style.display = "block";
    document.getElementById("createProjectButton").classList.remove("hidden");
    document.getElementById("logoutButton").classList.remove("hidden");
    
    // Load all projects for admin
    const projectsResponse = await fetch("/api/all-projects");
    const projectsData = await projectsResponse.json();
    createProjectSelectElement(projectsData.containerNames);
    
    document.getElementById("currentTrack").textContent = "Please select your project";
    playPauseButton.addEventListener("click", playPause);
    return;
  }
  
  // Add event listeners for radio buttons if auth section exists
  const adminRadio = document.getElementById("adminAccess");
  const listenerRadio = document.getElementById("listenerAccess");
  const passwordLabel = document.getElementById("passwordLabel");
  
  if (adminRadio && listenerRadio && passwordLabel) {
    adminRadio.addEventListener("change", () => {
      passwordLabel.innerHTML = '<i class="fas fa-lock"></i> Enter Admin Password:';
      document.getElementById("passwordInput").placeholder = "Enter admin password";
    });
    
    listenerRadio.addEventListener("change", () => {
      passwordLabel.innerHTML = '<i class="fas fa-lock"></i> Enter Project Password:';
      document.getElementById("passwordInput").placeholder = "Enter project password";
    });
  }
  
  // Allow Enter key to submit authentication
  const passwordInput = document.getElementById('passwordInput');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        authenticateUser();
      }
    });
  }
});

async function authenticateUser() {
  const adminRadio = document.getElementById("adminAccess");
  const password = document.getElementById("passwordInput").value.trim();
  const authError = document.getElementById("authError");
  const authErrorText = document.getElementById("authErrorText");
  
  if (!password) {
    authErrorText.textContent = "Please enter a password";
    authError.style.display = "block";
    return;
  }
  
  try {
    if (adminRadio.checked) {
      // Admin Access - check against WEB_PAGE_PASSWORD
      const response = await fetch("/api/check-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      
      if (response.ok) {
        isAdminMode = true;
        // Store admin authentication in sessionStorage
        sessionStorage.setItem('isAdmin', 'true');
        
        document.getElementById("authSection").style.display = "none";
        document.getElementById("mainApp").style.display = "block";
        document.getElementById("createProjectButton").classList.remove("hidden");
        document.getElementById("logoutButton").classList.remove("hidden");
        
        // Load all projects for admin
        const projectsResponse = await fetch("/api/all-projects");
        const projectsData = await projectsResponse.json();
        createProjectSelectElement(projectsData.containerNames);
        
        document.getElementById("currentTrack").textContent = "Please select your project";
        playPauseButton.addEventListener("click", playPause);
      } else {
        authErrorText.textContent = "Invalid admin password";
        authError.style.display = "block";
      }
    } else {
      // Listener Access - check against PublicKey
      const response = await fetch("/api/check-publicKey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: password }),
      });
      
      if (response.ok) {
        isAdminMode = false;
        document.getElementById("authSection").style.display = "none";
        document.getElementById("mainApp").style.display = "block";
        // Keep createProjectButton hidden for listeners
        document.getElementById("createProjectButton").classList.add("hidden");
        
        const data = await response.json();
        createProjectSelectElement(data.containerNames);
        
        document.getElementById("currentTrack").textContent = "Please select your project";
        playPauseButton.addEventListener("click", playPause);
      } else {
        authErrorText.textContent = "Invalid project password";
        authError.style.display = "block";
      }
    }
  } catch (error) {
    console.error("Authentication error:", error);
    authErrorText.textContent = "Authentication failed. Please try again.";
    authError.style.display = "block";
  }
}

// Expose authenticateUser to global scope for inline onclick handler
window.authenticateUser = authenticateUser;

// Logout function
function logoutUser() {
  if (confirm('Are you sure you want to logout?')) {
    sessionStorage.removeItem('isAdmin');
    window.location.reload();
  }
}

// Expose logoutUser to global scope
window.logoutUser = logoutUser;

// Remove old DOMContentLoaded that used prompt
/*
document.addEventListener("DOMContentLoaded", async () => {
  playPauseButton.addEventListener("click", playPause);

  // Fetch container names and create project select element
  const publicKey = prompt("Enter a public key");
  try {
    const response = await fetch("/api/check-publicKey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey }),
    });

    if (!response.ok) {
      document.getElementById("currentTrack").textContent =
        "No project found for this public key. Please try again.";

      throw new Error("Failed to fetch container names");
    }

    document.getElementById("currentTrack").textContent =
      "Please select your project";

    const data = await response.json();
    console.log("Container names:", data.containerNames);
    createProjectSelectElement(data.containerNames);
  } catch (error) {
    console.error("Error fetching container names:", error);
    // Handle the error (e.g., show an error message to the user)
  }
});
*/

function waitForMediaElement(callback) {
  const checkInterval = setInterval(() => {
    if (wavesurfer.getMediaElement()) {
      clearInterval(checkInterval);
      callback();
    }
  }, 100); // Check every 100ms
}

function connectAnalyser() {
  console.log("Connecting analyser...");
  console.log("Media element:", audioElement);
  console.log("Analyser:", analyser);
  console.log("AudioContext state:", audioContext?.state);

  if (audioElement) {
    console.log("Media element found:", audioElement);

    if (!sourceNode) {
      try {
        // Resume audio context if suspended
        if (audioContext.state === 'suspended') {
          audioContext.resume().then(() => {
            console.log('AudioContext resumed');
          });
        }
        
        sourceNode = audioContext.createMediaElementSource(audioElement);
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
        console.log("Analyser connected successfully.");
      } catch (error) {
        console.error("Error connecting analyser:", error);
      }
    } else {
      console.log("Source node already exists, skipping connection.");
    }
  } else {
    console.log("Media element not found.");
  }
}

function initPeaks() {
  return new Promise((resolve, reject) => {
    console.log("Initializing Peaks.js...");
    console.log("typeof Peaks:", typeof Peaks);
    console.log("typeof peaks:", typeof peaks);
    console.log("window.peaks:", window.peaks);

    if (peaksInstance) {
      console.log("Peaks.js already initialized.");
      resolve(peaksInstance);
      return;
    }

    // Check both Peaks and peaks (library might export as lowercase)
    const PeaksLib = typeof Peaks !== 'undefined' ? Peaks : (typeof peaks !== 'undefined' ? peaks : null);
    
    if (!PeaksLib) {
      console.error("❌ Peaks library not found! Trying to load from script tag...");
      console.log("Script tags:", Array.from(document.querySelectorAll('script')).map(s => s.src));
      // Start polling for library if needed, but for now just fail
      reject(new Error("Peaks library not found"));
      return;
    }
    
    console.log("✓ Peaks library found:", PeaksLib);

    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // Always recreate analyser to ensure it's connected to current context
    // or reusing existing if appropriate, but keeping logical flow simple
    if (!analyser) {
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      analyser.maxDecibels = -10;
      fftData = new Uint8Array(analyser.frequencyBinCount);
    }

    audioElement = document.getElementById('audio');
    
    if (!audioElement) {
      console.error("❌ Audio element not found!");
      reject(new Error("Audio element not found"));
      return;
    }

    // Set CORS for spectrum analyzer
    audioElement.crossOrigin = 'anonymous';
    console.log("Set crossOrigin attribute on audio element");

    // Check if containers exist
    const zoomContainer = document.getElementById('zoomview-container');
    const overviewContainer = document.getElementById('overview-container');
    
    if (!zoomContainer || !overviewContainer) {
      console.error("❌ Peaks.js containers not found in DOM!");
      reject(new Error("Containers not found"));
      return;
    }
    
    if (zoomContainer.offsetWidth === 0 || overviewContainer.offsetWidth === 0) {
      console.error("❌ Peaks.js containers have zero width! They need dimensions.");
      reject(new Error("Containers have zero width"));
      return;
    }

    console.log("✓ Containers have proper dimensions");
    console.log("✓ Attempting to initialize Peaks.js with options...");

    // Initialize Peaks.js with the first track's WebAudio data if available, 
    // otherwise we need to wait for tracks to be loaded
    if (!window.initialAudioBuffer) {
      // We defer initialization until we have at least one track loaded
      console.log("Deferring Peaks initialization until first track is loaded...");
      window.pendingPeaksInit = true;
      resolve(null); // Resolve with null to satisfy await, but caller should check
      return; 
    }

    const optionsNew = {
      zoomview: {
        container: zoomContainer,
        waveformColor: 'rgba(200, 200, 255, 0.5)',
        playheadColor: '#FF1493'
      },
      overview: {
        container: overviewContainer,
        waveformColor: 'rgba(147, 112, 219, 0.5)',
        playheadColor: '#FF1493'
      },
      mediaElement: audioElement,
      mediaUrl: window.initialMediaUrl, // Add this for consistency
      webAudio: {
        audioContext: audioContext,
        audioBuffer: window.initialAudioBuffer // Use the preloaded buffer!
      },
      keyboard: true,
      showPlayheadTime: true
    };

    console.log("Trying NEW API format with initial buffer:", optionsNew);
    console.log("Calling PeaksLib.init...");

    PeaksLib.init(optionsNew, function(err, peaks) {
      console.log("=== PEAKS.INIT CALLBACK CALLED ===");
      
      if (err) {
        console.error('Failed to initialize Peaks.js:', err);
        reject(err);
        return;
      }
      
      peaksInstance = peaks;
      console.log("✓ Peaks.js initialized successfully!");
      
      // Connect spectrum analyzer
      connectAnalyser();
      
      // Setup UI events
      setupSpectrumAnalyzer();
      
      resolve(peaksInstance);
    });

    // Event listeners for play/pause (idempotent, safe to add here)
    if (!audioElement.hasAttribute('data-listeners-added')) {
        audioElement.addEventListener('play', () => {
          console.log("Audio playing...");
          playPauseButton.innerHTML = '<i class="fas fa-pause"></i> PAUSE';
        });

        audioElement.addEventListener('pause', () => {
          console.log("Audio paused...");
          playPauseButton.innerHTML = '<i class="fas fa-play"></i> PLAY';
        });
        audioElement.setAttribute('data-listeners-added', 'true');
    }
  });
}

function setupSpectrumAnalyzer() {
  // Only initialize once to avoid multiple animation loops
  if (spectrumAnalyzerInitialized) {
    console.log("Spectrum analyzer already initialized.");
    return;
  }
  
  const canvas = document.getElementById("audioSpectrum");
  if (!canvas) {
    console.error("Canvas element 'audioSpectrum' not found!");
    return;
  }
  
  const canvasCtx = canvas.getContext("2d");
  
  // Mouse position and frequency display
  let mouseX = -1;
  let mouseY = -1;
  let isHovering = false;
  
  // Add mouse event listeners for frequency display
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    isHovering = true;
  });
  
  canvas.addEventListener('mouseleave', () => {
    isHovering = false;
    mouseX = -1;
    mouseY = -1;
  });
  
  // Function to update canvas size
  function updateCanvasSize() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width || 800;  // Fallback width
    canvas.height = rect.height || 300; // Fallback height
    console.log(`Canvas size updated: ${canvas.width}x${canvas.height}`);
  }
  
  // Set initial size
  updateCanvasSize();
  
  // Update size on window resize
  window.addEventListener('resize', updateCanvasSize);

  function draw() {
    requestAnimationFrame(draw);

    if (!analyser || !fftData) {
      // Clear canvas with white background when no data
      canvasCtx.fillStyle = "rgb(255, 255, 255)";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    analyser.getByteFrequencyData(fftData);
    
    // Check if we're getting any data
    const hasData = fftData.some(value => value > 0);
    if (!hasData) {
      // Clear with white if no audio data
      canvasCtx.fillStyle = "rgb(255, 255, 255)";
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // Clear canvas with white background
    canvasCtx.fillStyle = "rgb(255, 255, 255)";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Logarithmic frequency display from 20 Hz to 20000 Hz
    const nyquistFrequency = audioContext.sampleRate / 2;
    const minFreq = 20;
    const maxFreq = 20000;
    const minLog = Math.log10(minFreq);
    const maxLog = Math.log10(maxFreq);
    
    // Draw bars with logarithmic frequency spacing
    for (let x = 0; x < canvas.width; x++) {
      // Calculate frequency for this pixel position (logarithmic)
      const logFreq = minLog + (x / canvas.width) * (maxLog - minLog);
      const frequency = Math.pow(10, logFreq);
      
      // Map frequency to FFT bin
      const binIndex = Math.floor((frequency / nyquistFrequency) * fftData.length);
      
      if (binIndex >= 0 && binIndex < fftData.length) {
        const barHeight = fftData[binIndex];

        // Gradient start and end colors
        const startColor = { r: 23, g: 162, b: 184 }; // #17a2b8 (teal)
        const endColor = { r: 230, g: 210, b: 205 }; // #e6d2cd (light pink)

        // Calculate the color based on the bar height
        const ratio = barHeight / 255; // Normalize the barHeight to range [0, 1]
        const red = Math.round(startColor.r * (1 - ratio) + endColor.r * ratio);
        const green = Math.round(startColor.g * (1 - ratio) + endColor.g * ratio);
        const blue = Math.round(startColor.b * (1 - ratio) + endColor.b * ratio);

        canvasCtx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        canvasCtx.fillRect(
          x,
          canvas.height - barHeight / 2,
          1,
          barHeight / 2
        );
      }
    }
    
    // Draw frequency indicator when hovering
    if (isHovering && mouseX >= 0) {
      // Calculate frequency from mouse position (logarithmic scale)
      const minFreq = 20;
      const maxFreq = 20000;
      const minLog = Math.log10(minFreq);
      const maxLog = Math.log10(maxFreq);
      const logFreq = minLog + (mouseX / canvas.width) * (maxLog - minLog);
      const frequency = Math.round(Math.pow(10, logFreq));
      
      // Draw vertical line at mouse position
      canvasCtx.strokeStyle = "rgba(220, 53, 69, 0.8)"; // Red line
      canvasCtx.lineWidth = 2;
      canvasCtx.beginPath();
      canvasCtx.moveTo(mouseX, 0);
      canvasCtx.lineTo(mouseX, canvas.height);
      canvasCtx.stroke();
      
      // Draw frequency label
      const label = `${frequency} Hz`;
      canvasCtx.font = "bold 16px Arial";
      canvasCtx.fillStyle = "rgba(0, 0, 0, 0.9)";
      canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      canvasCtx.lineWidth = 3;
      
      // Position label above mouse or below if near top
      const labelX = mouseX + 10;
      const labelY = mouseY < 30 ? mouseY + 20 : mouseY - 10;
      
      // Draw outline for readability
      canvasCtx.strokeText(label, labelX, labelY);
      canvasCtx.fillText(label, labelX, labelY);
    }
  }

  console.log("Starting spectrum analyzer animation...");
  console.log("Analyser state:", analyser);
  console.log("AudioContext state:", audioContext?.state);
  console.log("FFT data length:", fftData?.length);
  spectrumAnalyzerInitialized = true;
  draw();
}

// Preload all tracks into memory for instant switching
async function preloadAllTracks(trackUrls) {
  if (isPreloading) {
    console.log("Preloading already in progress...");
    return;
  }

  // Ensure AudioContext is initialized before we try to decode anything
  if (!audioContext) {
    console.log("Initializing AudioContext in preloadAllTracks...");
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  isPreloading = true;
  // Note: audioCache and blobCache should be cleared by the caller (e.g. on project change)
  // if strict separation is needed. We append/overwrite here.
  if (!audioCache) audioCache = {};
  if (!blobCache) blobCache = {};
  
  console.log(`Starting to preload ${trackUrls.length} tracks...`);

  const preloadPromises = trackUrls.map(async (url, index) => {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      
      // Decode audio for Peaks.js
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      audioCache[url] = audioBuffer;
      
      // Also create Blob URL for quick src switching
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);
      blobCache[url] = blobUrl;
      
      console.log(`✓ Preloaded track ${index + 1}/${trackUrls.length}: ${url.split("/").pop().split("?")[0]}`);
      
    } catch (error) {
      console.error(`Failed to preload track: ${url}`, error);
    }
  });

  await Promise.all(preloadPromises);
  isPreloading = false;
  console.log("All tracks preloaded with decoded audio buffers!");
}

function loadTrack(track, autoPlay = false) {
  console.log("=== LOADTRACK CALLED ===");
  console.log("Track URL:", track);

  // Prevent concurrent loads
  if (isLoadingTrack) {
    console.warn("⚠️ Already loading a track, ignoring request");
    return;
  }

  // Show play button
  playPauseButton.classList.remove("hidden");
  playPauseButton.style.display = "inline";

  if (!audioElement || !peaksInstance) {
    console.error("❌ Audio element or Peaks.js not initialized");
    return;
  }

  // Set loading flag
  isLoadingTrack = true;

  // Store current playback state
  let wasPlaying = !audioElement.paused;
  let currentTime = audioElement.currentTime;
  
  console.log(`📊 Current state - wasPlaying: ${wasPlaying}, currentTime: ${currentTime}`);

  // Auto-play if it was already playing
  autoPlay = autoPlay || wasPlaying;

  // Use cached blob URL
  const urlToLoad = blobCache[track] || track;
  const audioBuffer = audioCache[track];
  
  // Pause current playback
  if (wasPlaying) {
    audioElement.pause();
  }
  
  // Update audio source - instant switch!
  audioElement.src = urlToLoad;
  
  // Update Peaks.js waveform if we have the decoded buffer
  if (audioBuffer) {
    console.log("✨ Updating Peaks.js waveform with cached audio buffer");
    peaksInstance.setSource({
      mediaUrl: urlToLoad,
      webAudio: {
        audioContext: audioContext,
        audioBuffer: audioBuffer
      }
    }, function(err) {
      if (err) {
        console.error('Failed to update Peaks.js:', err);
      } else {
        console.log("✓ Waveform updated successfully!");
      }
    });
  }
  
  // Restore playback position
  if (currentTime > 0) {
    audioElement.currentTime = currentTime;
  }
  
  // Resume playback if it was playing
  if (autoPlay) {
    audioElement.play().then(() => {
      console.log("✓ Playback resumed");
    }).catch(err => {
      console.error("❌ Failed to resume playback:", err);
    });
  }
  
  isLoadingTrack = false;

  // Update current track display
  document.getElementById("currentTrack").textContent =
    "Current Track: " + track.split("/").pop().split("?")[0];
  const waveformLabel = document.getElementById("waveform-track-name");
  if (waveformLabel) {
    waveformLabel.textContent = track.split("/").pop().split("?")[0];
  }
}

function playPause() {
  console.log("Play/Pause");
  if (audioElement && !audioElement.paused) {
    audioElement.pause();
  } else if (audioElement) {
    audioElement.play();
  }
}

function clearWaveformRegions() {
  console.log("Regions feature not implemented with Peaks.js yet");
  // TODO: Implement with Peaks.js points/segments if needed
}

// Define a function to hide all speaker buttons
function hideAllSpeakerButtons() {
  for (let i = 1; i <= 10; i++) {
    const button = document.getElementById(`switchToSpeaker${i}`);
    button.classList.add("hidden"); // Hides the button
    button.textContent = ""; // Clears any previous text
  }
}

// Function to show and label speaker buttons based on available tracks
function showSpeakerButtons(tracks) {
  tracks.forEach((track, index) => {
    const buttonId = `switchToSpeaker${index + 1}`;
    const button = document.getElementById(buttonId);
    if (button) {
      // Extract just the filename from the URL (remove path and query parameters)
      const url = new URL(track);
      const pathname = url.pathname;
      const filename = pathname.split("/").pop(); // Get last part of path
      const displayName = filename.replace(/\.(mp3|wav|flac|ogg|aac|m4a)$/i, ''); // Remove extension
      
      button.textContent = displayName; // Sets button label to clean file name
      button.classList.remove("hidden"); // Shows the button
      if (index === 0) button.classList.add("active");
      button.addEventListener("click", () => {
        // Remove active from all source buttons
        for (let i = 1; i <= 10; i++) {
          const b = document.getElementById(`switchToSpeaker${i}`);
          if (b) b.classList.remove("active");
        }
        button.classList.add("active");
        loadTrack(track, true);
      });
    }
  });
}

function createWaveformRegion(startTime, endTime, label) {
  // console.log("Regions plugin:", wsRegions);
  if (!wsRegions) {
    console.error("Regions plugin is not initialized.");
    return;
  }

  // // Check if a region with the same label already exists
  // for (let regionId in wsRegions.list) {
  //   let region = wsRegions.list[regionId];
  //   console.log("Region:", region);
  //   if (region.attributes.label === label) {
  //     console.log("Region with the same label already exists.");
  //     return;
  //   }
  // }

  // var isLabelAlreadyMade = isLabelInSessionStorage(label);
  // console.log("isLabelAlreadyMade:", isLabelAlreadyMade);

  // if (!isLabelAlreadyMade) {
  // console.log("Creating region:", startTime, endTime, label);
  wsRegions.addRegion({
    start: startTime,
    end: endTime,
    content: label,
    color: "rgba(255,10,200,0.1)",
    drag: false,
    resize: false,
  });

  //sessionStorage.setItem("label", sessionStorage.getItem("label") + label);
  //sessionStorage.setItem("label", label);

  // }
}

// Function to create project select element
function createProjectSelectElement(containerNames) {
  projectSelect.id = "project-select";
  emptyOption.textContent = "";
  emptyOption.value = "";
  projectSelect.appendChild(emptyOption);

  containerNames.forEach((containerName) => {
    const option = document.createElement("option");
    option.textContent = containerName;
    option.value = containerName;
    projectSelect.appendChild(option);
  });

  projectContainer.appendChild(projectSelect);
}

// Event listener for select change
// Event listener for select change
projectSelect.addEventListener("change", async function () {
  document.getElementById("playPauseButton").textContent = "PLAY";

  console.log("Project selected:", this.value); // Logs the selected project name (folder name
  const projectName = this.value;

  // Reset caches for new project
  audioCache = {};
  blobCache = {};

  hideAllSpeakerButtons(); // First, hide all speaker buttons

  // Clear existing regions
  clearWaveformRegions();

  regionsCreated = false; // Reset the flag when project changes

  // Fetch tracks from the server
  fetch(`/api/tracks/${projectName}`)
    .then((response) => response.json())
    .then(async (tracksData) => {
      //console.log("Tracks fetched:", tracksData);
      tracks = tracksData; // data should be an array of track paths

      if (tracks.length > 0) {
        // 1. Preload the first track so we have data for Peaks initialization
        console.log("Preloading first track for Peaks init...");
        await preloadAllTracks([tracks[0]]);

        // 2. Set the buffer for initPeaks to pick up
        if (audioCache[tracks[0]]) {
           window.initialAudioBuffer = audioCache[tracks[0]];
           window.initialMediaUrl = blobCache[tracks[0]] || tracks[0];
        } else {
           console.error("First track failed to preload!");
        }

        // 3. Initialize Peaks
        await initPeaks();

        // 4. Load the track (UI update)
        console.log("Loading first track...");
        loadTrack(tracks[0], false);

        // 5. Preload the rest
        if (tracks.length > 1) {
             const rest = tracks.slice(1);
             preloadAllTracks(rest); 
        }
      }

      // Show switch buttons after initialization
      showSpeakerButtons(tracks); // Display and label speaker buttons

      // Fetch labels
      // console.log("Fetching labels for", projectName);
      return fetch(`/api/labels/${projectName}`);
    })
    .then((response) => response.text())
    .then((data) => {
      // console.log("Labels fetched:", data);
      lines = "";
      label = "";
      // console.log("Lines before assignement:", lines);
      // Split the text file into lines
      lines = data.split("\n");

      if (lines[lines.length - 1] === "") lines = lines.slice(0, -1); // Remove the last empty line

      // TODO: Implement regions with Peaks.js segments API if needed
      console.log("Labels loaded, but regions not yet implemented with Peaks.js");
      
      // For future implementation with Peaks.js:
      // lines.forEach((line) => {
      //   parts = line.split("\t");
      //   startTime = parts[0];
      //   endTime = parts[1];
      //   label = parts[parts.length - 1];
      //   peaksInstance.segments.add({
      //     startTime: Number(startTime),
      //     endTime: Number(endTime),
      //     labelText: label
      //   });
      // });
    })
    .catch((error) => {
      console.error("Error fetching tracks:", error);
      alert("Failed to load tracks for " + projectName);
    });
});

// element.addEventListener("wheel", eventHandler, { passive: true });
function isLabelInSessionStorage(label) {
  const storedLabels = sessionStorage.getItem("label");
  if (storedLabels === null) {
    return false;
  }
  return storedLabels.includes(label);
}
