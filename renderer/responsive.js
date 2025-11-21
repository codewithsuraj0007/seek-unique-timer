// ==================== RESPONSIVE BEHAVIOR MANAGER ====================

class ResponsiveManager {
  constructor() {
    this.breakpoints = {
      mobile: 480,
      tablet: 768,
      desktop: 1024,
      large: 1400
    };
    
    this.currentBreakpoint = this.getCurrentBreakpoint();
    this.observers = [];
    this.resizeTimeout = null;
    
    this.init();
  }
  
  init() {
    this.setupEventListeners();
    this.setupIntersectionObserver();
    this.setupResizeObserver();
    this.optimizePerformance();
    this.handleInitialLoad();
  }
  
  getCurrentBreakpoint() {
    const width = window.innerWidth;
    if (width <= this.breakpoints.mobile) return 'mobile';
    if (width <= this.breakpoints.tablet) return 'tablet';
    if (width <= this.breakpoints.desktop) return 'desktop';
    return 'large';
  }
  
  setupEventListeners() {
    // Throttled resize handler
    window.addEventListener('resize', () => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => {
        this.handleResize();
      }, 100);
    });
    
    // Orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 100);
    });
    
    // Touch and mouse events for better interaction
    this.setupTouchHandlers();
  }
  
  setupTouchHandlers() {
    // Add touch-friendly interactions
    document.addEventListener('touchstart', (e) => {
      if (e.target.classList.contains('pill') || e.target.classList.contains('responsive-button')) {
        e.target.style.transform = 'scale(0.95)';
      }
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
      if (e.target.classList.contains('pill') || e.target.classList.contains('responsive-button')) {
        setTimeout(() => {
          e.target.style.transform = '';
        }, 150);
      }
    }, { passive: true });
  }
  
  setupIntersectionObserver() {
    // Animate elements as they come into view
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);
    
    // Observe elements with animation classes
    document.querySelectorAll('.slide-up, .slide-left, .slide-right, .fade-in').forEach(el => {
      observer.observe(el);
    });
    
    this.observers.push(observer);
  }
  
  setupResizeObserver() {
    if ('ResizeObserver' in window) {
      const resizeObserver = new ResizeObserver(entries => {
        entries.forEach(entry => {
          this.handleElementResize(entry.target, entry.contentRect);
        });
      });
      
      // Observe main containers
      document.querySelectorAll('.wrap, .main-section, .responsive-grid').forEach(el => {
        resizeObserver.observe(el);
      });
      
      this.observers.push(resizeObserver);
    }
  }
  
  handleResize() {
    const newBreakpoint = this.getCurrentBreakpoint();
    
    if (newBreakpoint !== this.currentBreakpoint) {
      this.currentBreakpoint = newBreakpoint;
      this.onBreakpointChange(newBreakpoint);
    }
    
    this.updateViewportUnits();
    this.adjustFloatingTimer();
    this.optimizeGridLayouts();
  }
  
  onBreakpointChange(breakpoint) {
    document.body.setAttribute('data-breakpoint', breakpoint);
    
    // Adjust grid columns based on breakpoint
    this.adjustGridColumns(breakpoint);
    
    // Update button layouts
    this.updateButtonLayouts(breakpoint);
    
    // Adjust timer circles
    this.adjustTimerCircles(breakpoint);
    
    // Emit custom event
    window.dispatchEvent(new CustomEvent('breakpointChange', { 
      detail: { breakpoint, previousBreakpoint: this.currentBreakpoint } 
    }));
  }
  
  adjustGridColumns(breakpoint) {
    const grids = document.querySelectorAll('.responsive-grid');
    
    grids.forEach(grid => {
      if (grid.classList.contains('three-column')) {
        if (breakpoint === 'mobile') {
          grid.style.gridTemplateColumns = '1fr';
        } else if (breakpoint === 'tablet') {
          grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
        } else {
          grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
        }
      } else if (grid.classList.contains('two-column')) {
        if (breakpoint === 'mobile' || breakpoint === 'tablet') {
          grid.style.gridTemplateColumns = '1fr';
        } else {
          grid.style.gridTemplateColumns = '1fr 1fr';
        }
      }
    });
  }
  
  updateButtonLayouts(breakpoint) {
    const controls = document.querySelector('.controls');
    if (!controls) return;
    
    if (breakpoint === 'mobile') {
      controls.style.gridTemplateColumns = '1fr';
    } else if (breakpoint === 'tablet') {
      controls.style.gridTemplateColumns = 'repeat(2, 1fr)';
    } else {
      controls.style.gridTemplateColumns = 'repeat(3, 1fr)';
    }
  }
  
  adjustTimerCircles(breakpoint) {
    const circles = document.querySelectorAll('.compact-timer-circle');
    const sizes = {
      mobile: { width: 60, height: 60, fontSize: '1rem' },
      tablet: { width: 80, height: 80, fontSize: '1.1rem' },
      desktop: { width: 100, height: 100, fontSize: '1.2rem' },
      large: { width: 120, height: 120, fontSize: '1.4rem' }
    };
    
    const size = sizes[breakpoint];
    circles.forEach(circle => {
      circle.style.width = `${size.width}px`;
      circle.style.height = `${size.height}px`;
      
      const svg = circle.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', size.width);
        svg.setAttribute('height', size.height);
      }
      
      const valueEl = circle.querySelector('[id$="Value"]');
      if (valueEl) {
        valueEl.style.fontSize = size.fontSize;
      }
    });
  }
  
  updateViewportUnits() {
    // Fix viewport height issues on mobile
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  
  adjustFloatingTimer() {
    const floatingTimer = document.getElementById('floatingTimer');
    if (!floatingTimer) return;
    
    const breakpoint = this.currentBreakpoint;
    
    if (breakpoint === 'mobile') {
      floatingTimer.style.width = 'calc(100vw - 30px)';
      floatingTimer.style.left = '15px';
      floatingTimer.style.right = 'auto';
      floatingTimer.style.bottom = '15px';
    } else {
      floatingTimer.style.width = '';
      floatingTimer.style.left = '';
      floatingTimer.style.right = '25px';
      floatingTimer.style.bottom = '25px';
    }
  }
  
  optimizeGridLayouts() {
    // Auto-adjust grid gaps based on available space
    const grids = document.querySelectorAll('.responsive-grid');
    
    grids.forEach(grid => {
      const rect = grid.getBoundingClientRect();
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const availableWidth = rect.width;
      
      if (availableWidth < 600 && columns > 1) {
        grid.style.gap = 'clamp(10px, 2vw, 15px)';
      } else {
        grid.style.gap = '';
      }
    });
  }
  
  handleElementResize(element, rect) {
    // Handle specific element resize logic
    if (element.classList.contains('compact-timer-circle')) {
      this.adjustCircleSize(element, rect);
    }
  }
  
  adjustCircleSize(circle, rect) {
    const svg = circle.querySelector('svg');
    if (!svg) return;
    
    const size = Math.min(rect.width, rect.height);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    
    const svgCircle = svg.querySelector('circle:last-child');
    if (svgCircle) {
      const radius = (size / 2) - 8;
      svgCircle.setAttribute('cx', size / 2);
      svgCircle.setAttribute('cy', size / 2);
      svgCircle.setAttribute('r', radius);
      svgCircle.setAttribute('stroke-dasharray', 2 * Math.PI * radius);
    }
  }
  
  optimizePerformance() {
    // Add performance optimizations
    document.querySelectorAll('.responsive-card, .pill, .compact-timer-circle').forEach(el => {
      el.classList.add('gpu-accelerated');
    });
    
    // Lazy load non-critical animations
    this.setupLazyAnimations();
  }
  
  setupLazyAnimations() {
    const lazyElements = document.querySelectorAll('[style*="animation-delay"]');
    
    lazyElements.forEach((el, index) => {
      setTimeout(() => {
        el.classList.add('animate-ready');
      }, index * 100);
    });
  }
  
  handleInitialLoad() {
    // Set initial breakpoint attribute
    document.body.setAttribute('data-breakpoint', this.currentBreakpoint);
    
    // Initialize viewport units
    this.updateViewportUnits();
    
    // Set up initial layouts
    this.adjustGridColumns(this.currentBreakpoint);
    this.updateButtonLayouts(this.currentBreakpoint);
    this.adjustTimerCircles(this.currentBreakpoint);
    
    // Add loaded class for CSS transitions
    setTimeout(() => {
      document.body.classList.add('responsive-loaded');
    }, 100);
  }
  
  // Public API methods
  getBreakpoint() {
    return this.currentBreakpoint;
  }
  
  isBreakpoint(breakpoint) {
    return this.currentBreakpoint === breakpoint;
  }
  
  isMobile() {
    return this.currentBreakpoint === 'mobile';
  }
  
  isTablet() {
    return this.currentBreakpoint === 'tablet';
  }
  
  isDesktop() {
    return this.currentBreakpoint === 'desktop' || this.currentBreakpoint === 'large';
  }
  
  destroy() {
    // Clean up observers
    this.observers.forEach(observer => {
      if (observer.disconnect) observer.disconnect();
    });
    
    // Clear timeouts
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
    
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
  }
}

// ==================== ENHANCED UI UTILITIES ====================

class UIEnhancer {
  constructor() {
    this.init();
  }
  
  init() {
    this.setupRippleEffects();
    this.setupSmartScrolling();
    this.setupAccessibilityFeatures();
    this.setupProgressiveEnhancement();
  }
  
  setupRippleEffects() {
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('pill') || e.target.classList.contains('responsive-button')) {
        this.createRipple(e);
      }
    });
  }
  
  createRipple(event) {
    const button = event.target;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;
    
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple-effect 0.6s ease-out;
      pointer-events: none;
    `;
    
    button.appendChild(ripple);
    
    setTimeout(() => {
      if (ripple.parentNode) {
        ripple.parentNode.removeChild(ripple);
      }
    }, 600);
  }
  
  setupSmartScrolling() {
    // Smooth scroll behavior for anchor links
    document.addEventListener('click', (e) => {
      if (e.target.matches('a[href^="#"]')) {
        e.preventDefault();
        const target = document.querySelector(e.target.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }
  
  setupAccessibilityFeatures() {
    // Enhanced keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        document.body.classList.add('keyboard-navigation');
      }
    });
    
    document.addEventListener('mousedown', () => {
      document.body.classList.remove('keyboard-navigation');
    });
    
    // ARIA live regions for dynamic content
    this.setupLiveRegions();
  }
  
  setupLiveRegions() {
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.style.cssText = `
      position: absolute;
      left: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    `;
    document.body.appendChild(liveRegion);
    
    window.announceToScreenReader = (message) => {
      liveRegion.textContent = message;
      setTimeout(() => {
        liveRegion.textContent = '';
      }, 1000);
    };
  }
  
  setupProgressiveEnhancement() {
    // Feature detection and progressive enhancement
    if ('IntersectionObserver' in window) {
      document.body.classList.add('has-intersection-observer');
    }
    
    if ('ResizeObserver' in window) {
      document.body.classList.add('has-resize-observer');
    }
    
    if (CSS.supports('display', 'grid')) {
      document.body.classList.add('has-css-grid');
    }
    
    if (CSS.supports('backdrop-filter', 'blur(10px)')) {
      document.body.classList.add('has-backdrop-filter');
    }
  }
}

// ==================== INITIALIZATION ====================

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeResponsive);
} else {
  initializeResponsive();
}

function initializeResponsive() {
  // Add CSS for ripple effect
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ripple-effect {
      to {
        transform: scale(2);
        opacity: 0;
      }
    }
    
    .keyboard-navigation *:focus {
      outline: 2px solid var(--primary) !important;
      outline-offset: 2px !important;
    }
    
    .animate-in {
      animation-play-state: running !important;
    }
    
    .responsive-loaded * {
      transition-duration: 0.3s;
    }
    
    .gpu-accelerated {
      transform: translateZ(0);
      will-change: transform;
    }
  `;
  document.head.appendChild(style);
  
  // Initialize managers
  window.responsiveManager = new ResponsiveManager();
  window.uiEnhancer = new UIEnhancer();
  
  // Global utilities
  window.getBreakpoint = () => window.responsiveManager.getBreakpoint();
  window.isMobile = () => window.responsiveManager.isMobile();
  window.isTablet = () => window.responsiveManager.isTablet();
  window.isDesktop = () => window.responsiveManager.isDesktop();
  
  console.log('Responsive system initialized');
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (window.responsiveManager) {
    window.responsiveManager.destroy();
  }
});