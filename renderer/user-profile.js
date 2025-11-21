// Dynamic User Profile & Productivity System
class UserProfileManager {
    constructor() {
        this.userData = null;
        this.productivityData = null;
        this.init();
    }

    init() {
        this.loadUserData();
        this.setupProductivitySync();
        this.startAutoUpdate();
    }

    // Load user data from localStorage or default
    loadUserData() {
        // Try to load from userProfile first (permanent save)
        let saved = localStorage.getItem('userProfile');
        if (saved) {
            try {
                const profile = JSON.parse(saved);
                this.userData = {
                    name: profile.displayName || 'User',
                    photo: profile.photoURL || null,
                    initials: this.getInitials(profile.displayName || 'User')
                };
                this.updateUserDisplay();
                return;
            } catch (e) {
                console.warn('Failed to load userProfile:', e);
            }
        }
        
        // Fallback to userData
        saved = localStorage.getItem('userData');
        this.userData = saved ? JSON.parse(saved) : {
            name: 'User',
            photo: null,
            initials: 'U'
        };
        this.updateUserDisplay();
    }

    // Sync with productivity system
    setupProductivitySync() {
        // Watch for productivity changes
        const observer = new MutationObserver(() => {
            this.updateProductivityDisplay();
        });

        const productivityElement = document.getElementById('productivityPercent');
        if (productivityElement) {
            observer.observe(productivityElement, { 
                childList: true, 
                subtree: true, 
                characterData: true 
            });
        }

        // Initial update
        this.updateProductivityDisplay();
    }

    // Get current productivity value
    getProductivityValue() {
        const element = document.getElementById('productivityPercent');
        if (!element) return 0;
        
        const text = element.textContent || '0%';
        return parseInt(text.replace('%', '')) || 0;
    }

    // Update user display elements
    updateUserDisplay() {
        // Update all user name elements
        const nameElements = ['userName', 'profileName'];
        nameElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = this.userData.name;
            }
        });

        // Update greeting text
        const greetingText = document.getElementById('greetingText');
        if (greetingText) {
            const userNameSpan = greetingText.querySelector('#userName');
            if (userNameSpan) {
                userNameSpan.textContent = this.userData.name;
            } else {
                greetingText.innerHTML = `Hey, <span id="userName">${this.userData.name}</span> 👋`;
            }
        }

        // Update user photo/avatar elements
        const photoElements = ['userPhoto', 'avatar'];
        photoElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                if (this.userData.photo) {
                    element.innerHTML = `<img src="${this.userData.photo}" alt="User Photo">`;
                } else {
                    element.innerHTML = `<span>${this.userData.initials}</span>`;
                }
            }
        });
    }

    // Update productivity display and stars
    updateProductivityDisplay() {
        const productivity = this.getProductivityValue();
        
        // Update productivity percentage in user section
        const userProductivityElement = document.querySelector('.user-section #productivityPercent');
        if (userProductivityElement) {
            userProductivityElement.textContent = `${productivity}%`;
        }

        // Update stars based on productivity
        this.updateStarRating(productivity);
    }

    // Calculate and display star rating
    updateStarRating(productivity) {
        const starContainer = document.getElementById('starRating');
        if (!starContainer) return;

        // Calculate stars (20% = 1 star, 100% = 5 stars)
        const starCount = Math.floor(productivity / 20);
        const hasHalfStar = (productivity % 20) >= 10;
        
        let starsHTML = '';
        
        // Full stars
        for (let i = 0; i < starCount; i++) {
            starsHTML += '<span class="star active">⭐</span>';
        }
        
        // Half star
        if (hasHalfStar && starCount < 5) {
            starsHTML += '<span class="star half">⭐</span>';
        }
        
        // Empty stars
        const totalStars = hasHalfStar ? starCount + 1 : starCount;
        for (let i = totalStars; i < 5; i++) {
            starsHTML += '<span class="star">⭐</span>';
        }
        
        starContainer.innerHTML = starsHTML;
    }

    // Update user data
    updateUserData(name, photo = null) {
        this.userData.name = name || 'User';
        this.userData.photo = photo;
        this.userData.initials = this.getInitials(name);
        
        // Save to both userData and userProfile for compatibility
        localStorage.setItem('userData', JSON.stringify(this.userData));
        
        // Also save to userProfile for permanent persistence
        if (window.lastUser) {
            localStorage.setItem('userProfile', JSON.stringify({
                displayName: name,
                photoURL: photo,
                uid: window.lastUser.uid
            }));
        }
        
        this.updateUserDisplay();
    }

    // Update from Firebase user data
    updateFromFirebase() {
        if (window.lastUser) {
            this.updateUserData(
                window.lastUser.displayName || 'User',
                window.lastUser.photoURL || null
            );
        }
    }

    // Get user initials
    getInitials(name) {
        if (!name) return 'U';
        return name.split(' ')
            .map(word => word.charAt(0).toUpperCase())
            .slice(0, 2)
            .join('');
    }

    // Auto-update every second
    startAutoUpdate() {
        setInterval(() => {
            this.updateProductivityDisplay();
        }, 1000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.userProfileManager = new UserProfileManager();
});

// Export for use in other scripts
window.UserProfileManager = UserProfileManager;