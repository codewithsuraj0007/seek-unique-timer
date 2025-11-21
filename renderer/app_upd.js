// Merged App - User Profile & UI Enhancements
// Combined functionality from app_upd.js and app_ugd.js

console.log('Enhanced User Profile & UI module loaded');

// Dynamic User Profile & Productivity System
class UserProfileManager {
    constructor() {
        this.userData = this.loadUserData();
        this.motivationalMessages = [
            "Every frame you edit brings your vision to life! 🎬",
            "Your creativity shapes amazing stories! ✨",
            "Transform raw footage into cinematic magic! 🎥",
            "Each cut brings you closer to perfection! ✂️",
            "You're crafting visual masterpieces! 🎨",
            "Your editing skills are getting sharper! 🔥",
            "Creating content that inspires others! 🚀",
            "Turning ideas into visual reality! 🌟",
            "Your dedication to quality shows! 💪",
            "Building stories frame by frame! 🏗️"
        ];
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        console.log('UserProfileManager initialized');
        this.setupProductivitySync();
        this.startAutoUpdate();
        this.setupEditProfile();
        this.updateMotivationalMessage();
        
        // Initialize UI enhancements
        setTimeout(() => {
            initializeUIEnhancements();
            document.body.classList.remove('loading');
        }, 100);
    }
    
    syncWithFirebaseUser() {
        // Simple direct update - no complex timing
        if (window.lastUser) {
            this.updateUserFromFirebase(window.lastUser);
        }
    }
    
    updateUserFromFirebase(user) {
        if (!user) return;
        
        const userName = document.getElementById('userName');
        const userPhoto = document.getElementById('userPhoto');
        
        if (userName) {
            userName.textContent = user.displayName || 'User';
        }
        
        if (userPhoto) {
            if (user.photoURL) {
                userPhoto.innerHTML = `<img src="${user.photoURL}" alt="User Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.2);">`;
            } else {
                const initials = (user.displayName || 'User').split(' ').map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('');
                userPhoto.innerHTML = `<span style="font-size: 24px; font-weight: bold; color: white;">${initials}</span>`;
                userPhoto.style.background = 'linear-gradient(135deg, #ff006e, #8000ff)';
                userPhoto.style.display = 'flex';
                userPhoto.style.alignItems = 'center';
                userPhoto.style.justifyContent = 'center';
            }
            
        }
    }

    loadUserData() {
        // Get data from Firebase auth if available
        if (window.lastUser) {
            return {
                name: window.lastUser.displayName || 'User',
                photo: window.lastUser.photoURL || null,
                initials: this.getInitials(window.lastUser.displayName || 'User')
            };
        }
        
        const saved = localStorage.getItem('userData');
        const defaultData = {
            name: 'User',
            photo: null,
            initials: 'U'
        };
        return saved ? JSON.parse(saved) : defaultData;
    }
    
    getInitials(name) {
        return name ? name.split(' ').map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('') : 'U';
    }

    setupProductivitySync() {
        // Monitor the totals section for productivity changes
        const totalsElement = document.getElementById('totals');
        if (totalsElement) {
            const observer = new MutationObserver(() => {
                this.syncProductivityFromTotals();
            });
            observer.observe(totalsElement, { 
                childList: true, subtree: true, characterData: true 
            });
        }
        
        // Initial sync
        setTimeout(() => this.syncProductivityFromTotals(), 1000);
    }

    syncProductivityFromTotals() {
        // Find productivity value from totals section (now in bar chart format)
        const totalsElement = document.getElementById('totals');
        if (!totalsElement) return;
        
        // Look for productivity in bar chart format
        const productivityItem = Array.from(totalsElement.querySelectorAll('.bar-item')).find(item => 
            item.querySelector('.bar-label')?.textContent?.toLowerCase().includes('productivity')
        );
        
        if (productivityItem) {
            const productivityText = productivityItem.querySelector('.bar-value')?.textContent || '0%';
            const productivityValue = parseInt(productivityText.replace('%', '')) || 0;
            
            // Update our productivity display
            const productivityPercent = document.getElementById('productivityPercent');
            if (productivityPercent) {
                productivityPercent.textContent = productivityValue + '%';
            }
            
            this.updateStarRating(productivityValue);
        }
        
        // Also update grand total timer
        this.updateGrandTotalTimer();
    }

    updateUserDisplay() {
        console.log('Updating user display:', this.userData);
        
        // Update username in all locations
        ['userName', 'profileName'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = this.userData.name;
            }
        });

        // Update profile photos in all locations
        ['userPhoto', 'avatar'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (this.userData.photo) {
                    element.innerHTML = `<img src="${this.userData.photo}" alt="User Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.2);">`;
                } else {
                    // Create gradient avatar with initials
                    element.innerHTML = `<span style="font-size: 24px; font-weight: bold; color: white;">${this.userData.initials}</span>`;
                    element.style.background = 'linear-gradient(135deg, #ff006e, #8000ff)';
                    element.style.display = 'flex';
                    element.style.alignItems = 'center';
                    element.style.justifyContent = 'center';
                }
            }
        });
    }

    updateMotivationalMessage() {
        const messageElement = document.getElementById('motivationalMessage');
        if (!messageElement) return;
        
        // Get day of year to ensure message changes daily
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const diff = now - start;
        const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        // Use day of year and user name to create consistent but changing message
        const messageIndex = (dayOfYear + this.userData.name.length) % this.motivationalMessages.length;
        messageElement.textContent = this.motivationalMessages[messageIndex];
    }

    updateStarRating(productivity) {
        const starContainer = document.getElementById('starRating');
        if (!starContainer) return;

        const fullStars = Math.floor(productivity / 20);
        const hasHalfStar = (productivity % 20) >= 10;
        
        let starsHTML = '';
        
        // Full stars (golden)
        for (let i = 0; i < fullStars; i++) {
            starsHTML += '<span class="star active" style="color: #FFD700; filter: drop-shadow(0 0 8px #FFD700); transform: scale(1.1); transition: all 0.3s ease;">⭐</span>';
        }
        
        // Half star (semi-golden)
        if (hasHalfStar && fullStars < 5) {
            starsHTML += '<span class="star half" style="color: #FFA500; filter: drop-shadow(0 0 6px #FFA500); transition: all 0.3s ease;">⭐</span>';
        }
        
        // Empty stars (gray)
        const totalActiveStars = hasHalfStar ? fullStars + 1 : fullStars;
        for (let i = totalActiveStars; i < 5; i++) {
            starsHTML += '<span class="star" style="color: #666; opacity: 0.4; transition: all 0.3s ease;">⭐</span>';
        }
        
        starContainer.innerHTML = starsHTML;
        
        // Add animation effect
        starContainer.style.animation = 'starUpdate 0.5s ease-in-out';
        setTimeout(() => {
            starContainer.style.animation = '';
        }, 500);
    }

    updateUserData(name, photo = null) {
        this.userData.name = name || 'User';
        if (photo) {
            this.userData.photo = photo;
        }
        this.userData.initials = this.getInitials(name || 'User');
        
        // Update Firebase user profile if possible
        if (window.lastUser && typeof window.updateProfile === 'function') {
            try {
                window.updateProfile(window.lastUser, {
                    displayName: this.userData.name,
                    photoURL: this.userData.photo
                });
            } catch (e) {
                console.log('Firebase profile update not available');
            }
        }
        
        localStorage.setItem('userData', JSON.stringify(this.userData));
        this.updateUserDisplay();
        this.updateMotivationalMessage();
    }

    setupEditProfile() {
        const btnEditProfile = document.getElementById('btnEditProfile');
        const editProfileModal = document.getElementById('editProfileModal');
        const cancelProfile = document.getElementById('cancelProfile');
        const saveProfile = document.getElementById('saveProfile');
        const profileNameInput = document.getElementById('profileNameInput');
        const profilePhotoInput = document.getElementById('profilePhotoInput');

        if (btnEditProfile) {
            btnEditProfile.addEventListener('click', () => {
                profileNameInput.value = this.userData.name;
                editProfileModal.classList.add('show');
            });
        }

        if (cancelProfile) {
            cancelProfile.addEventListener('click', () => {
                editProfileModal.classList.remove('show');
            });
        }

        if (saveProfile) {
            saveProfile.addEventListener('click', () => {
                const name = profileNameInput.value.trim();
                const photoFile = profilePhotoInput.files[0];
                
                if (photoFile) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        this.updateUserData(name, e.target.result);
                        editProfileModal.classList.remove('show');
                    };
                    reader.readAsDataURL(photoFile);
                } else {
                    this.updateUserData(name);
                    editProfileModal.classList.remove('show');
                }
            });
        }

        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && editProfileModal.classList.contains('show')) {
                editProfileModal.classList.remove('show');
            }
        });
    }

    startAutoUpdate() {
        setInterval(() => {
            this.syncProductivityFromTotals();
        }, 2000);
        
        // Update grand total timer more frequently for real-time updates
        setInterval(() => {
            this.updateGrandTotalTimer();
        }, 1000);
        
        // Update motivational message daily
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const msUntilMidnight = tomorrow.getTime() - now.getTime();
        setTimeout(() => {
            this.updateMotivationalMessage();
            // Set daily interval
            setInterval(() => this.updateMotivationalMessage(), 24 * 60 * 60 * 1000);
        }, msUntilMidnight);
    }
    
    updateGrandTotal(currentElapsed) {
        // Update grand total circular timer
        this.updateGrandTotalTimer();
        
        const grandTimerText = document.getElementById('grandTimerText');
        if (grandTimerText) {
            const hours = Math.floor(currentElapsed / 3600);
            const minutes = Math.floor((currentElapsed % 3600) / 60);
            const seconds = currentElapsed % 60;
            grandTimerText.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        // Also update work type display
        const liveType = document.getElementById('liveType');
        const workType = document.getElementById('workType');
        if (liveType && workType && liveType.textContent && liveType.textContent !== '—') {
            workType.textContent = liveType.textContent;
        }
    }
    
    updateGrandTotalTimer() {
        // Find grand total from totals section (now in bar chart format)
        const totalsElement = document.getElementById('totals');
        if (!totalsElement) return;
        
        // Look for Grand Total in bar chart format
        const grandTotalItem = Array.from(totalsElement.querySelectorAll('.bar-item')).find(item => 
            item.querySelector('.bar-label')?.textContent?.toLowerCase().includes('grand total')
        );
        
        if (grandTotalItem) {
            const timeText = grandTotalItem.querySelector('.bar-value')?.textContent || '00:00:00';
            const timeParts = timeText.split(':');
            
            if (timeParts.length === 3) {
                const hours = parseInt(timeParts[0]) || 0;
                const minutes = parseInt(timeParts[1]) || 0;
                const seconds = parseInt(timeParts[2]) || 0;
                
                // Update display values
                const hoursValue = document.getElementById('grandHoursValue');
                const minutesValue = document.getElementById('grandMinutesValue');
                const secondsValue = document.getElementById('grandSecondsValue');
                
                if (hoursValue) hoursValue.textContent = String(hours).padStart(2, '0');
                if (minutesValue) minutesValue.textContent = String(minutes).padStart(2, '0');
                if (secondsValue) secondsValue.textContent = String(seconds).padStart(2, '0');
                
                // Update rings (471.24 is circumference for r=75)
                const hoursRing = document.getElementById('grandHoursRing');
                const minutesRing = document.getElementById('grandMinutesRing');
                const secondsRing = document.getElementById('grandSecondsRing');
                
                if (hoursRing) {
                    const hoursProgress = Math.min(hours / 24, 1); // 24 hour max
                    const hoursOffset = 471.24 - (hoursProgress * 471.24);
                    hoursRing.style.strokeDashoffset = hoursOffset;
                }
                
                if (minutesRing) {
                    const minutesProgress = minutes / 60;
                    const minutesOffset = 471.24 - (minutesProgress * 471.24);
                    minutesRing.style.strokeDashoffset = minutesOffset;
                }
                
                if (secondsRing) {
                    const secondsProgress = seconds / 60;
                    const secondsOffset = 471.24 - (secondsProgress * 471.24);
                    secondsRing.style.strokeDashoffset = secondsOffset;
                }
            }
        }
        
        // Enhance bar chart after update
        this.enhanceBarChart();
    }
    
    // Enhanced bar chart functionality
    enhanceBarChart() {
        try {
            const totalsEl = document.getElementById('totals');
            if (!totalsEl) return;
            
            // Add smooth transitions and hover effects
            const barItems = totalsEl.querySelectorAll('.bar-item');
            barItems.forEach((item, index) => {
                item.style.animationDelay = `${index * 0.1}s`;
                item.classList.add('bar-item-animated');
                
                const barFill = item.querySelector('.bar-fill');
                if (barFill) {
                    barFill.addEventListener('animationend', () => {
                        barFill.style.animation = 'none';
                    });
                }
            });
        } catch (e) {
            console.warn('Bar chart enhancement failed:', e);
        }
    }
}

// UI/UX Enhancement Functions
function initializeUIEnhancements() {
    addButtonEnhancements();
    addScrollAnimations();
    enhanceModals();
    addParticleEffects();
    enhanceTimerDisplay();
    enhanceFloatingTimer();
    addLoadingAnimations();
    setTimeout(initializeUserSection, 1000);
    initializeDynamicTimerColors();
    initializeWatchStructure();
    initializeGrandTotalTimer();
    console.log('UI enhancements initialized');
}

function addButtonEnhancements() {
    const buttons = document.querySelectorAll('.pill, .btn, .editProfile');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
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
            
            this.style.animation = 'buttonClick 0.4s ease-out';
            createParticleBurst(e.clientX, e.clientY);
            
            setTimeout(() => {
                ripple.remove();
                this.style.animation = '';
            }, 600);
        });
        
        button.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-4px) scale(1.03)';
            this.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.3), 0 0 20px rgba(255, 255, 255, 0.1)';
        });
        
        button.addEventListener('mouseleave', function() {
            this.style.transform = '';
            this.style.boxShadow = '';
        });
    });
    
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
        
        setTimeout(() => particle.remove(), 800);
    }
}

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
    
    const animatedElements = document.querySelectorAll('.log-row, .box');
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });
}

function enhanceModals() {
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        const modalCard = modal.querySelector('.modal-card');
        
        modal.show = function() {
            modal.style.display = 'grid';
            requestAnimationFrame(() => {
                modal.classList.add('show');
                modalCard.style.animation = 'modalSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            });
        };
        
        modal.hide = function() {
            modalCard.style.animation = 'modalSlideOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            setTimeout(() => {
                modal.classList.remove('show');
            }, 300);
        };
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.hide();
            }
        });
    });
    
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
        
        setTimeout(() => particle.remove(), 25000);
    }
    
    if (!document.getElementById('particle-animations')) {
        const style = document.createElement('style');
        style.id = 'particle-animations';
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
            
            @keyframes starUpdate {
                0% {
                    transform: scale(1);
                }
                50% {
                    transform: scale(1.1);
                }
                100% {
                    transform: scale(1);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    setInterval(createParticle, 3000);
}

function enhanceTimerDisplay() {
    const timerElements = ['#liveClock', '#workTimer', '#grandTimerText'];
    
    timerElements.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) {
            element.addEventListener('animationend', function() {
                this.style.animation = 'none';
                requestAnimationFrame(() => {
                    this.style.animation = 'pulse 3s ease-in-out infinite';
                });
            });
        }
    });
    
    // Initialize circular timer rings
    initializeCircularTimers();
}

function initializeCircularTimers() {
    // Update circular timer rings based on current time
    function updateCircularTimers(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        // Update values
        const hoursValue = document.getElementById('hoursValue');
        const minutesValue = document.getElementById('minutesValue');
        const secondsValue = document.getElementById('secondsValue');
        
        if (hoursValue) hoursValue.textContent = String(hours).padStart(2, '0');
        if (minutesValue) minutesValue.textContent = String(minutes).padStart(2, '0');
        if (secondsValue) secondsValue.textContent = String(seconds).padStart(2, '0');
        
        // Update rings (377 is the circumference for r=60)
        const hoursRing = document.getElementById('hoursRing');
        const minutesRing = document.getElementById('minutesRing');
        const secondsRing = document.getElementById('secondsRing');
        
        if (hoursRing) {
            const hoursProgress = (hours % 24) / 24;
            const hoursOffset = 377 - (hoursProgress * 377);
            hoursRing.style.strokeDashoffset = hoursOffset;
        }
        
        if (minutesRing) {
            const minutesProgress = minutes / 60;
            const minutesOffset = 377 - (minutesProgress * 377);
            minutesRing.style.strokeDashoffset = minutesOffset;
        }
        
        if (secondsRing) {
            const secondsProgress = seconds / 60;
            const secondsOffset = 377 - (secondsProgress * 377);
            secondsRing.style.strokeDashoffset = secondsOffset;
        }
    }
    
    // Monitor the main timer and update circular timers
    const liveClock = document.getElementById('liveClock');
    if (liveClock) {
        const observer = new MutationObserver(() => {
            const timeText = liveClock.textContent;
            const timeParts = timeText.split(':');
            if (timeParts.length === 3) {
                const totalSeconds = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseInt(timeParts[2]);
                updateCircularTimers(totalSeconds);
            }
        });
        
        observer.observe(liveClock, { childList: true, subtree: true, characterData: true });
        
        // Initial update
        const timeText = liveClock.textContent;
        const timeParts = timeText.split(':');
        if (timeParts.length === 3) {
            const totalSeconds = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseInt(timeParts[2]);
            updateCircularTimers(totalSeconds);
        }
    }
    
    // Monitor work type changes
    const liveType = document.getElementById('liveType');
    const workType = document.getElementById('workType');
    if (liveType && workType) {
        const typeObserver = new MutationObserver(() => {
            const currentType = liveType.textContent;
            if (currentType && currentType !== '—') {
                workType.textContent = currentType;
            }
        });
        
        typeObserver.observe(liveType, { childList: true, subtree: true, characterData: true });
    }
}

function enhanceFloatingTimer() {
    const floatingTimer = document.getElementById('floatingTimer');
    if (!floatingTimer) return;
    
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    floatingTimer.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;
        this.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        floatingTimer.style.left = `${initialX + deltaX}px`;
        floatingTimer.style.top = `${initialY + deltaY}px`;
        floatingTimer.style.right = 'auto';
        floatingTimer.style.bottom = 'auto';
    });
    
    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            floatingTimer.style.cursor = 'grab';
        }
    });
}

function addLoadingAnimations() {
    const elements = document.querySelectorAll('.card, .pill, .box');
    elements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        
        setTimeout(() => {
            el.style.transition = 'all 0.6s ease-out';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, index * 100);
    });
}

function initializeUserSection() {
    const userSection = document.querySelector('.user-section');
    if (userSection) {
        userSection.style.opacity = '0';
        userSection.style.transform = 'translateY(30px)';
        
        setTimeout(() => {
            userSection.style.transition = 'all 0.8s ease-out';
            userSection.style.opacity = '1';
            userSection.style.transform = 'translateY(0)';
        }, 500);
    }
}

function initializeDynamicTimerColors() {
    const timerRings = ['#hoursRing', '#minutesRing', '#secondsRing'];
    const colors = ['#ff006e', '#ffb700', '#00f5ff'];
    
    timerRings.forEach((selector, index) => {
        const ring = document.querySelector(selector);
        if (ring) {
            ring.style.filter = `drop-shadow(0 0 20px ${colors[index]})`;
            ring.style.strokeDasharray = '377';
            ring.style.strokeDashoffset = '377';
        }
    });
}

function initializeWatchStructure() {
    const timerCircles = document.querySelectorAll('.timer-circle');
    timerCircles.forEach((circle, index) => {
        circle.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.05)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        circle.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
    });
}

function initializeGrandTotalTimer() {
    // Initialize grand total timer rings
    const grandHoursRing = document.getElementById('grandHoursRing');
    const grandMinutesRing = document.getElementById('grandMinutesRing');
    const grandSecondsRing = document.getElementById('grandSecondsRing');
    
    if (grandHoursRing) {
        grandHoursRing.style.strokeDasharray = '471.24';
        grandHoursRing.style.strokeDashoffset = '471.24';
    }
    
    if (grandMinutesRing) {
        grandMinutesRing.style.strokeDasharray = '471.24';
        grandMinutesRing.style.strokeDashoffset = '471.24';
    }
    
    if (grandSecondsRing) {
        grandSecondsRing.style.strokeDasharray = '471.24';
        grandSecondsRing.style.strokeDashoffset = '471.24';
    }
    
    // Add hover effects to grand total timer circles
    const grandTimerCircles = document.querySelectorAll('.grand-total-timer .timer-circle');
    grandTimerCircles.forEach((circle, index) => {
        circle.addEventListener('mouseenter', function() {
            this.style.transform = 'scale(1.08)';
            this.style.transition = 'transform 0.3s ease';
        });
        
        circle.addEventListener('mouseleave', function() {
            this.style.transform = 'scale(1)';
        });
    });
    
    // Initial update
    if (window.userProfileManager && typeof window.userProfileManager.updateGrandTotalTimer === 'function') {
        setTimeout(() => {
            window.userProfileManager.updateGrandTotalTimer();
        }, 1000);
    }
}

// Initialize UserProfileManager
window.userProfileManager = new UserProfileManager();

// Global function to update profile from Firebase
window.updateUserProfile = function(user) {
    if (!user) return;
    
    const userName = document.getElementById('userName');
    const userPhoto = document.getElementById('userPhoto');
    
    if (userName) {
        userName.textContent = user.displayName || 'User';
    }
    
    if (userPhoto) {
        if (user.photoURL) {
            userPhoto.innerHTML = `<img src="${user.photoURL}" alt="User Photo" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.2);">`;
        } else {
            const initials = (user.displayName || 'User').split(' ').map(w => w.charAt(0).toUpperCase()).slice(0, 2).join('');
            userPhoto.innerHTML = `<span style="font-size: 24px; font-weight: bold; color: white;">${initials}</span>`;
            userPhoto.style.background = 'linear-gradient(135deg, #ff006e, #8000ff)';
            userPhoto.style.display = 'flex';
            userPhoto.style.alignItems = 'center';
            userPhoto.style.justifyContent = 'center';
        }
    }
}