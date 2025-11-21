// app_ugd.js - UI/UX Enhancements
// Modern animations and effects for Seek Unique Timer

console.log('UI Enhancement module loaded');

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    initializeUIEnhancements();
});

function initializeUIEnhancements() {
    // Enhanced button interactions
    addButtonEnhancements();
    
    // Smooth scrolling and animations
    addScrollAnimations();
    
    // Enhanced modal animations
    enhanceModals();
    
    // Add particle effects
    addParticleEffects();
    
    // Enhanced timer animations
    enhanceTimerDisplay();
    
    // Add hover sound effects (optional)
    addSoundEffects();
    
    // Enhanced floating timer
    enhanceFloatingTimer();
    
    // Add loading animation
    addLoadingAnimations();
    
    // Initialize user section with delay to ensure DOM is ready
    setTimeout(initializeUserSection, 1000);
    
    // Initialize dynamic timer colors
    initializeDynamicTimerColors();
    
    // Initialize watch structure
    initializeWatchStructure();
    
    console.log('UI enhancements initialized');
}

// Enhanced button interactions with ripple effects and cool animations
function addButtonEnhancements() {
    const buttons = document.querySelectorAll('.pill, .btn, .editProfile');
    
    buttons.forEach(button => {
        // Add ripple effect with enhanced animations
        button.addEventListener('click', function(e) {
            // Ripple effect
            const ripple = document.createElement('span');
            const rect = this.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;
            
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: rgba(255, 255, 255, 0.4);
                border-radius: 50%;
                transform: scale(0);
                animation: ripple 0.6s ease-out;
                pointer-events: none;
                z-index: 1;
            `;
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            // Cool click animation
            this.style.animation = 'buttonClick 0.4s ease-out';
            
            // Particle burst effect
            createParticleBurst(e.clientX, e.clientY);
            
            setTimeout(() => {
                ripple.remove();
                this.style.animation = '';
            }, 600);
        });
        
        // Enhanced hover effects
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px) scale(1.03)';
            this.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.3), 0 0 20px rgba(255, 255, 255, 0.1)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
    });
    
    // Add CSS for enhanced animations
    if (!document.getElementById('button-animations')) {
        const style = document.createElement('style');
        style.id = 'button-animations';
        style.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(2.5);
                    opacity: 0;
                }
            }
            
            @keyframes buttonClick {
                0% { transform: scale(1); }
                50% { transform: scale(0.95) rotateZ(2deg); }
                100% { transform: scale(1.05) rotateZ(0deg); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Create particle burst effect on button click
function createParticleBurst(x, y) {
    const colors = ['#ff006e', '#ff8500', '#00f5ff', '#8000ff', '#ffb700'];
    const particleCount = 8;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        const color = colors[Math.floor(Math.random() * colors.length)];
        const angle = (360 / particleCount) * i;
        const distance = 50 + Math.random() * 30;
        
        particle.style.cssText = `
            position: fixed;
            width: 6px;
            height: 6px;
            background: ${color};
            border-radius: 50%;
            left: ${x}px;
            top: ${y}px;
            pointer-events: none;
            z-index: 1000;
        `;
        
        document.body.appendChild(particle);
        
        // Animate particle
        const radians = (angle * Math.PI) / 180;
        const endX = x + Math.cos(radians) * distance;
        const endY = y + Math.sin(radians) * distance;
        
        particle.animate([
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${endX - x}px, ${endY - y}px) scale(0)`, opacity: 0 }
        ], {
            duration: 800,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        });
        
        setTimeout(() => {
            particle.remove();
        }, 800);
    }
}

// Smooth scroll animations for elements coming into view
function addScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // Observe elements that should animate in
    const animatedElements = document.querySelectorAll('.log-row, .box');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });
}

// Enhanced modal animations
function enhanceModals() {
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        const modalCard = modal.querySelector('.modal-card');
        
        // Enhanced show animation
        const originalShow = () => modal.classList.add('show');
        modal.show = function() {
            modal.style.display = 'grid';
            requestAnimationFrame(() => {
                modal.classList.add('show');
                modalCard.style.animation = 'modalSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            });
        };
        
        // Enhanced hide animation
        modal.hide = function() {
            modalCard.style.animation = 'modalSlideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            setTimeout(() => {
                modal.classList.remove('show');
            }, 300);
        };
        
        // Click outside to close
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.hide();
            }
        });
    });
    
    // Add modal animation styles
    if (!document.getElementById('modal-animations')) {
        const style = document.createElement('style');
        style.id = 'modal-animations';
        style.textContent = `
            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: scale(0.8) translateY(30px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            
            @keyframes modalSlideOut {
                from {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: scale(0.8) translateY(30px);
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Add subtle particle effects
function addParticleEffects() {
    const particleContainer = document.createElement('div');
    particleContainer.id = 'particles';
    particleContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1;
        overflow: hidden;
    `;
    document.body.appendChild(particleContainer);
    
    // Create floating particles
    function createParticle() {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: absolute;
            width: 2px;
            height: 2px;
            background: rgba(72, 3, 85, 0.3);
            border-radius: 50%;
            animation: float-particle ${15 + Math.random() * 10}s linear infinite;
            left: ${Math.random() * 100}%;
            top: 100%;
        `;
        
        particleContainer.appendChild(particle);
        
        setTimeout(() => {
            particle.remove();
        }, 25000);
    }
    
    // Add particle animation styles
    if (!document.getElementById('particle-styles')) {
        const style = document.createElement('style');
        style.id = 'particle-styles';
        style.textContent = `
            @keyframes float-particle {
                0% {
                    transform: translateY(0) rotate(0deg);
                    opacity: 0;
                }
                10% {
                    opacity: 1;
                }
                90% {
                    opacity: 1;
                }
                100% {
                    transform: translateY(-100vh) rotate(360deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Create particles periodically
    setInterval(createParticle, 3000);
}

// Enhanced timer display with pulsing effects
function enhanceTimerDisplay() {
    const liveClock = document.getElementById('liveClock');
    const liveType = document.getElementById('liveType');
    
    if (liveClock) {
        // Add glow effect when timer is running
        const observer = new MutationObserver(() => {
            if (liveClock.textContent !== '00:00:00') {
                liveClock.style.textShadow = '0 0 30px rgba(72, 3, 85, 0.6), 0 10px 30px rgba(0, 0, 0, 0.3)';
                liveClock.style.animation = 'pulse 2s ease-in-out infinite';
            } else {
                liveClock.style.textShadow = '0 10px 30px rgba(0, 0, 0, 0.3)';
                liveClock.style.animation = '';
            }
        });
        
        observer.observe(liveClock, { childList: true, characterData: true, subtree: true });
    }
    
    if (liveType) {
        // Enhanced type indicator
        const observer = new MutationObserver(() => {
            const type = liveType.textContent.toLowerCase();
            if (type !== '—') {
                liveType.style.animation = 'glow 2s ease-in-out infinite';
                liveType.style.boxShadow = '0 0 20px rgba(72, 3, 85, 0.4)';
            } else {
                liveType.style.animation = '';
                liveType.style.boxShadow = '';
            }
        });
        
        observer.observe(liveType, { childList: true, characterData: true, subtree: true });
    }
}

// Optional sound effects (subtle)
function addSoundEffects() {
    // Create audio context for subtle UI sounds
    let audioContext;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        console.log('Audio context not supported');
        return;
    }
    
    // Subtle click sound
    function playClickSound() {
        if (!audioContext) return;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    }
    
    // Add click sounds to buttons
    document.querySelectorAll('.pill, .btn').forEach(button => {
        button.addEventListener('click', playClickSound);
    });
}

// Enhanced floating timer with better interactions
function enhanceFloatingTimer() {
    const floatingTimer = document.getElementById('floatingTimer');
    if (!floatingTimer) return;
    
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    // Enhanced drag functionality
    floatingTimer.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        
        const rect = floatingTimer.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        
        floatingTimer.style.transition = 'none';
        floatingTimer.style.cursor = 'grabbing';
        
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        const newLeft = Math.max(0, Math.min(window.innerWidth - floatingTimer.offsetWidth, startLeft + deltaX));
        const newTop = Math.max(0, Math.min(window.innerHeight - floatingTimer.offsetHeight, startTop + deltaY));
        
        floatingTimer.style.left = newLeft + 'px';
        floatingTimer.style.top = newTop + 'px';
        floatingTimer.style.right = 'auto';
        floatingTimer.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            floatingTimer.style.transition = 'all 0.3s ease';
            floatingTimer.style.cursor = 'grab';
            
            // Save position
            const rect = floatingTimer.getBoundingClientRect();
            localStorage.setItem('floatingTimer-position', JSON.stringify({
                left: rect.left,
                top: rect.top
            }));
        }
    });
    
    // Restore saved position
    try {
        const savedPos = JSON.parse(localStorage.getItem('floatingTimer-position'));
        if (savedPos) {
            floatingTimer.style.left = savedPos.left + 'px';
            floatingTimer.style.top = savedPos.top + 'px';
            floatingTimer.style.right = 'auto';
            floatingTimer.style.bottom = 'auto';
        }
    } catch (e) {
        console.log('Could not restore floating timer position');
    }
}

// Loading animations for dynamic content
function addLoadingAnimations() {
    // Animate log rows when they're added
    const logsContainer = document.getElementById('logs');
    const totalsContainer = document.getElementById('totals');
    
    if (logsContainer) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.classList.contains('log-row')) {
                        node.style.opacity = '0';
                        node.style.transform = 'translateX(-20px)';
                        node.style.transition = 'all 0.4s ease-out';
                        
                        requestAnimationFrame(() => {
                            node.style.opacity = '1';
                            node.style.transform = 'translateX(0)';
                        });
                    }
                });
            });
        });
        
        observer.observe(logsContainer, { childList: true });
    }
    
    if (totalsContainer) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    const rows = totalsContainer.querySelectorAll('.log-row');
                    rows.forEach((row, index) => {
                        row.style.animation = `slideInUp 0.4s ease-out ${index * 0.1}s both`;
                    });
                }
            });
        });
        
        observer.observe(totalsContainer, { childList: true });
    }
}

// Enhanced form interactions
function enhanceFormInputs() {
    const inputs = document.querySelectorAll('.field');
    
    inputs.forEach(input => {
        // Add focus animations
        input.addEventListener('focus', function() {
            this.style.transform = 'scale(1.02)';
            this.style.boxShadow = '0 0 0 3px rgba(72, 3, 85, 0.1), 0 8px 25px rgba(0, 0, 0, 0.1)';
        });
        
        input.addEventListener('blur', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
        
        // Add typing animation
        input.addEventListener('input', function() {
            this.style.animation = 'inputPulse 0.3s ease-out';
            setTimeout(() => {
                this.style.animation = '';
            }, 300);
        });
    });
    
    // Add input animation styles
    if (!document.getElementById('input-animations')) {
        const style = document.createElement('style');
        style.id = 'input-animations';
        style.textContent = `
            @keyframes inputPulse {
                0% { transform: scale(1.02); }
                50% { transform: scale(1.04); }
                100% { transform: scale(1.02); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize form enhancements when DOM is ready
document.addEventListener('DOMContentLoaded', enhanceFormInputs);

// Smooth page transitions
function addPageTransitions() {
    // Add fade-in effect for the entire page
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease-in-out';
    
    window.addEventListener('load', () => {
        document.body.style.opacity = '1';
    });
    
    // Add exit animations for navigation
    window.addEventListener('beforeunload', () => {
        document.body.style.opacity = '0';
    });
}

// Initialize page transitions
addPageTransitions();

// Initialize user section with productivity sync and motivational messages
function initializeUserSection() {
    updateUserInfo();
    syncProductivityDisplay();
    setDailyMotivationalMessage();
    
    // Update user photo when profile changes
    const observer = new MutationObserver(() => {
        updateUserInfo();
    });
    
    const profileAvatar = document.getElementById('avatar');
    const profileName = document.getElementById('profileName');
    
    if (profileAvatar) observer.observe(profileAvatar, { childList: true, subtree: true });
    if (profileName) observer.observe(profileName, { childList: true, characterData: true, subtree: true });
}

// Update user info in the new section
function updateUserInfo() {
    const profileAvatar = document.getElementById('avatar');
    const profileName = document.getElementById('profileName');
    const userPhoto = document.getElementById('userPhoto');
    const userName = document.getElementById('userName');
    
    if (profileAvatar && userPhoto) {
        const avatarImg = profileAvatar.querySelector('img');
        if (avatarImg) {
            userPhoto.innerHTML = `<img src="${avatarImg.src}" alt="User Photo">`;
        } else {
            const avatarText = profileAvatar.textContent;
            userPhoto.innerHTML = `<span>${avatarText}</span>`;
        }
    }
    
    if (profileName && userName) {
        const name = profileName.textContent.trim();
        userName.textContent = name !== 'User' ? name : 'Creator';
    }
}

// Sync productivity display with main productivity value
function syncProductivityDisplay() {
    const productivityValue = document.getElementById('productivityValue');
    const productivityPercent = document.getElementById('productivityPercent');
    const starRating = document.getElementById('starRating');
    
    if (!productivityValue || !productivityPercent || !starRating) {
        setTimeout(syncProductivityDisplay, 500);
        return;
    }
    
    function updateProductivityDisplay() {
        const mainProductivity = productivityValue.innerHTML || productivityValue.textContent;
        const percentMatch = mainProductivity.match(/(\d+(?:\.\d+)?)%/);
        
        if (percentMatch) {
            const percent = parseFloat(percentMatch[1]);
            productivityPercent.textContent = `${percent}%`;
            updateStarRating(percent, starRating);
        } else {
            // If no percentage found, try to get from the <b> tag
            const boldElement = productivityValue.querySelector('b');
            if (boldElement) {
                const boldText = boldElement.textContent;
                const boldMatch = boldText.match(/(\d+(?:\.\d+)?)%/);
                if (boldMatch) {
                    const percent = parseFloat(boldMatch[1]);
                    productivityPercent.textContent = `${percent}%`;
                    updateStarRating(percent, starRating);
                    return;
                }
            }
            productivityPercent.textContent = '0%';
            updateStarRating(0, starRating);
        }
    }
    
    const observer = new MutationObserver(updateProductivityDisplay);
    observer.observe(productivityValue, { childList: true, characterData: true, subtree: true });
    
    // Initial update
    updateProductivityDisplay();
    
    // Also check periodically to ensure sync
    setInterval(updateProductivityDisplay, 2000);
}

// Update star rating based on productivity percentage
function updateStarRating(percent, container) {
    const maxStars = 5;
    const starsNeeded = Math.min(maxStars, Math.max(1, Math.ceil(percent / 20))); // 20% per star
    const fullStars = Math.floor(percent / 20);
    const hasHalfStar = (percent % 20) >= 10;
    
    let starsHTML = '';
    
    // Add full stars
    for (let i = 0; i < fullStars; i++) {
        starsHTML += '<span class="star active">⭐</span>';
    }
    
    // Add half star if needed
    if (hasHalfStar && fullStars < maxStars) {
        starsHTML += '<span class="star half">⭐</span>';
    }
    
    // Add remaining empty stars to reach minimum of 1 star
    const totalShown = fullStars + (hasHalfStar ? 1 : 0);
    const emptyStars = Math.max(1, maxStars) - totalShown;
    
    for (let i = 0; i < emptyStars; i++) {
        starsHTML += '<span class="star">⭐</span>';
    }
    
    container.innerHTML = starsHTML;
}

// Set daily motivational message
function setDailyMotivationalMessage() {
    const motivationElement = document.getElementById('motivationMessage');
    if (!motivationElement) return;
    
    const messages = [
        "Every frame you edit brings your vision to life! 🎬",
        "Today's cuts will be tomorrow's masterpiece! ✨",
        "Your creativity flows through every transition! 🌟",
        "Each edit is a step closer to perfection! 🎯",
        "Transform raw footage into pure magic! 🪄",
        "Your storytelling skills shine in every scene! 📽️",
        "Craft cinematic moments that inspire! 🎭",
        "Every color grade adds emotion to your story! 🎨",
        "Your editing rhythm creates visual poetry! 🎵",
        "Build worlds through the power of post-production! 🌍",
        "Your attention to detail makes all the difference! 🔍",
        "Create seamless flows that captivate audiences! 🌊",
        "Your creative vision deserves the perfect edit! 👁️",
        "Polish each frame until it sparkles! 💎",
        "Your editing skills are your superpower! 🦸",
        "Weave stories that touch hearts and minds! ❤️",
        "Every cut is a creative decision that matters! ⚡",
        "Your passion for editing shows in every project! 🔥",
        "Transform ordinary moments into extraordinary memories! 🌈",
        "Your editing desk is where dreams come alive! 💫"
    ];
    
    // Get user-specific message based on user ID and date
    const userId = getUserId();
    const today = new Date().toDateString();
    const messageIndex = getHashCode(userId + today) % messages.length;
    
    motivationElement.textContent = messages[messageIndex];
}

// Get user ID (fallback to a default if not available)
function getUserId() {
    const profileName = document.getElementById('profileName');
    return profileName ? profileName.textContent.trim() : 'default';
}

// Simple hash function for consistent daily messages
function getHashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

// Export functions for potential external use
// Dynamic timer color system
function initializeDynamicTimerColors() {
    const timerColors = {
        work: {
            gradient: 'linear-gradient(135deg, #4f065c, #6b1a7a)',
            glow: '0 0 30px rgba(79, 6, 92, 0.6), 0 10px 30px rgba(0, 0, 0, 0.3)',
            typeGlow: '0 0 20px rgba(79, 6, 92, 0.4)'
        },
        meeting: {
            gradient: 'linear-gradient(135deg, #2563eb, #60a5fa)',
            glow: '0 0 30px rgba(37, 99, 235, 0.6), 0 10px 30px rgba(0, 0, 0, 0.3)',
            typeGlow: '0 0 20px rgba(37, 99, 235, 0.4)'
        },
        lunch: {
            gradient: 'linear-gradient(135deg, #f59e0b, #fde047)',
            glow: '0 0 30px rgba(245, 158, 11, 0.6), 0 10px 30px rgba(0, 0, 0, 0.3)',
            typeGlow: '0 0 20px rgba(245, 158, 11, 0.4)'
        },
        break: {
            gradient: 'linear-gradient(135deg, #0d9488, #22d3ee)',
            glow: '0 0 30px rgba(13, 148, 136, 0.6), 0 10px 30px rgba(0, 0, 0, 0.3)',
            typeGlow: '0 0 20px rgba(13, 148, 136, 0.4)'
        },
        smm: {
            gradient: 'linear-gradient(135deg, #e11d48, #fb7185)',
            glow: '0 0 30px rgba(225, 29, 72, 0.6), 0 10px 30px rgba(0, 0, 0, 0.3)',
            typeGlow: '0 0 20px rgba(225, 29, 72, 0.4)'
        },
        activity: {
            gradient: 'linear-gradient(135deg, #8b5cf6, #c4b5fd)',
            glow: '0 0 30px rgba(139, 92, 246, 0.6), 0 10px 30px rgba(0, 0, 0, 0.3)',
            typeGlow: '0 0 20px rgba(139, 92, 246, 0.4)'
        },
        copyright: {
            gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
            glow: '0 0 30px rgba(14, 165, 233, 0.6), 0 10px 30px rgba(0, 0, 0, 0.3)',
            typeGlow: '0 0 20px rgba(14, 165, 233, 0.4)'
        },
        default: {
            gradient: 'linear-gradient(135deg, #ffffff, #6b1a7a)',
            glow: '0 10px 30px rgba(0, 0, 0, 0.3)',
            typeGlow: '0 0 20px rgba(72, 3, 85, 0.3)'
        }
    };
    
    const liveClock = document.getElementById('liveClock');
    const liveType = document.getElementById('liveType');
    
    // Watch for timer type changes
    if (liveType) {
        const observer = new MutationObserver(() => {
            const currentType = liveType.textContent.toLowerCase().trim();
            updateTimerColors(currentType, liveClock, liveType, timerColors);
        });
        
        observer.observe(liveType, { childList: true, characterData: true, subtree: true });
        
        // Initial color set
        const initialType = liveType.textContent.toLowerCase().trim();
        updateTimerColors(initialType, liveClock, liveType, timerColors);
    }
}

function updateTimerColors(type, clockEl, typeEl, colors) {
    const colorScheme = colors[type] || colors.default;
    
    if (clockEl) {
        clockEl.style.background = colorScheme.gradient;
        clockEl.style.webkitBackgroundClip = 'text';
        clockEl.style.webkitTextFillColor = 'transparent';
        clockEl.style.backgroundClip = 'text';
        clockEl.style.textShadow = colorScheme.glow;
        clockEl.style.animation = 'pulse 3s ease-in-out infinite, colorPulse 2s ease-in-out infinite';
    }
    
    if (typeEl && type !== '—') {
        typeEl.style.background = colorScheme.gradient;
        typeEl.style.boxShadow = colorScheme.typeGlow;
        typeEl.style.animation = 'glow 2s ease-in-out infinite, typePulse 3s ease-in-out infinite';
    }
}

// Add enhanced animation styles
if (!document.getElementById('timer-color-animations')) {
    const style = document.createElement('style');
    style.id = 'timer-color-animations';
    style.textContent = `
        @keyframes colorPulse {
            0%, 100% { filter: brightness(1) saturate(1); }
            50% { filter: brightness(1.2) saturate(1.3); }
        }
        
        @keyframes typePulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
    `;
    document.head.appendChild(style);
}

// Initialize watch structure with grand total sync and timer switching
function initializeWatchStructure() {
    // Initialize rings immediately with default values
    setTimeout(() => {
        updateRing('hoursRing', 'hoursValue', 0, 24);
        updateRing('minutesRing', 'minutesValue', 0, 60);
        updateRing('secondsRing', 'secondsValue', 0, 60);
    }, 100);
    
    const totalsEl = document.getElementById('totals');
    if (totalsEl) {
        const observer = new MutationObserver(() => {
            updateWatchRings();
            switchTimerOnCircularUpdate();
        });
        
        observer.observe(totalsEl, { childList: true, subtree: true, characterData: true });
    }
    
    // Initial update
    setTimeout(updateWatchRings, 1000);
    
    // Update every second for smooth animation
    setInterval(updateWatchRings, 1000);
}

// Switch timer upon circular timer update
function switchTimerOnCircularUpdate() {
    const grandTimerText = document.getElementById('grandTimerText');
    const liveType = document.getElementById('liveType');
    
    if (grandTimerText && liveType) {
        const currentType = liveType.textContent.toLowerCase().trim();
        if (currentType === 'work' || currentType === '—') {
            // Switch to work timer when circular timer updates
            const workBtn = document.getElementById('btnWork');
            if (workBtn && currentType === '—') {
                // Auto-switch to work when no timer is active
                setTimeout(() => {
                    workBtn.click();
                }, 100);
            }
        }
    }
}

function updateWatchRings() {
    try {
        const totalsEl = document.getElementById('totals');
        if (!totalsEl) return;
        
        // Find Grand Total row
        const grandTotalRow = Array.from(totalsEl.querySelectorAll('.log-row')).find(row => 
            row.textContent.includes('Grand Total')
        );
        
        if (!grandTotalRow) return;
        
        const timeSpan = grandTotalRow.querySelector('span');
        if (!timeSpan) return;
        
        const timeText = timeSpan.textContent.trim();
        const timeParts = timeText.split(':');
        
        if (timeParts.length === 3) {
            const hours = parseInt(timeParts[0]) || 0;
            const minutes = parseInt(timeParts[1]) || 0;
            const seconds = parseInt(timeParts[2]) || 0;
            
            updateRing('hoursRing', 'hoursValue', hours, 24);
            updateRing('minutesRing', 'minutesValue', minutes, 60);
            updateRing('secondsRing', 'secondsValue', seconds, 60);
            
            // Update grand timer display
            const grandTimerText = document.getElementById('grandTimerText');
            if (grandTimerText) {
                grandTimerText.textContent = timeText;
            }
            
            // Sync work timer with live clock
            const workTimer = document.getElementById('workTimer');
            const liveClock = document.getElementById('liveClock');
            const workType = document.getElementById('workType');
            const liveType = document.getElementById('liveType');
            
            if (workTimer && liveClock) {
                workTimer.textContent = liveClock.textContent;
            }
            
            if (workType && liveType) {
                const currentType = liveType.textContent.trim();
                workType.textContent = currentType === '—' ? 'WORK' : currentType.toUpperCase();
            }
            

            
            if (workTimer && liveClock) {
                workTimer.textContent = liveClock.textContent;
            }
            
            if (workType && liveType) {
                const currentType = liveType.textContent.trim();
                workType.textContent = currentType === '—' ? 'WORK' : currentType.toUpperCase();
            }
        }
    } catch (e) {
        console.warn('Watch rings update failed:', e);
    }
}

function updateRing(ringId, valueId, value, maxValue) {
    const ring = document.getElementById(ringId);
    const valueEl = document.getElementById(valueId);
    
    if (ring && valueEl) {
        // Calculate progress (0 to 1)
        const progress = value / maxValue;
        
        // Calculate stroke-dashoffset (377 is full circle for r=60)
        const circumference = 377;
        const offset = circumference - (progress * circumference);
        
        ring.style.strokeDashoffset = offset;
        valueEl.textContent = String(value).padStart(2, '0');
    }
}

window.UIEnhancements = {
    addButtonEnhancements,
    addScrollAnimations,
    enhanceModals,
    addParticleEffects,
    enhanceTimerDisplay,
    enhanceFloatingTimer,
    addLoadingAnimations,
    initializeUserSection,
    updateUserInfo,
    syncProductivityDisplay,
    setDailyMotivationalMessage,
    initializeDynamicTimerColors,
    initializeWatchStructure,
    switchTimerOnCircularUpdate
};

console.log('UI Enhancement module fully loaded');