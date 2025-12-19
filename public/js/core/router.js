// SPA Router with History API for clean URLs
import { ExhibitLoader } from './exhibit-loader.js';

class Router {
  constructor() {
    this.exhibitLoader = new ExhibitLoader();
    this.currentRoute = null;
    this.currentExhibit = null;

    this.galleryView = document.getElementById('gallery-view');
    this.exhibitView = document.getElementById('exhibit-view');
    this.loading = document.getElementById('loading');
    this.backBtn = document.getElementById('back-btn');

    this.init();
  }

  init() {
    // Handle browser back/forward buttons
    window.addEventListener('popstate', (e) => {
      this.handleRoute(window.location.pathname, false);
    });

    // Handle back button click
    this.backBtn.addEventListener('click', () => {
      this.navigateTo('/');
    });

    // Handle keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Initial route
    this.handleRoute(window.location.pathname, true);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // ESC - Back to gallery
      if (e.key === 'Escape') {
        if (this.currentExhibit) {
          this.navigateTo('/');
        }
      }

      // Space - Pause/Play (if exhibit supports it)
      if (e.key === ' ' && this.currentExhibit) {
        e.preventDefault();
        if (this.currentExhibit.togglePause) {
          this.currentExhibit.togglePause();
        }
      }

      // R - Reset (if exhibit supports it)
      if (e.key === 'r' || e.key === 'R') {
        if (this.currentExhibit && this.currentExhibit.reset) {
          this.currentExhibit.reset();
        }
      }
    });
  }

  async handleRoute(path, replaceState = false) {
    // Remove trailing slash except for root
    if (path !== '/' && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    // Already on this route
    if (this.currentRoute === path) {
      return;
    }

    this.currentRoute = path;

    // Root path - show gallery
    if (path === '/' || path === '') {
      this.showGallery();
      return;
    }

    // Extract exhibit ID from path (e.g., /mandelbrot -> mandelbrot)
    const exhibitId = path.substring(1);

    if (!exhibitId) {
      this.showGallery();
      return;
    }

    // Load and show exhibit
    await this.showExhibit(exhibitId);
  }

  async showExhibit(exhibitId) {
    // Show loading
    this.showLoading();

    try {
      // Cleanup previous exhibit
      if (this.currentExhibit) {
        await this.exhibitLoader.unloadExhibit(this.currentExhibit);
        this.currentExhibit = null;
      }

      // Load new exhibit
      this.currentExhibit = await this.exhibitLoader.loadExhibit(exhibitId);

      if (!this.currentExhibit) {
        console.error(`Exhibit "${exhibitId}" not found`);
        this.navigateTo('/');
        return;
      }

      // Update UI
      document.getElementById('exhibit-title').textContent = this.currentExhibit.config.title;

      // Update info panel
      const infoTitle = document.getElementById('info-title');
      const infoDescription = document.getElementById('info-description');
      const infoInstructions = document.getElementById('info-instructions');

      if (infoTitle) infoTitle.textContent = this.currentExhibit.config.title;
      if (infoDescription) infoDescription.textContent = this.currentExhibit.config.description;
      if (infoInstructions && this.currentExhibit.config.instructions) {
        infoInstructions.innerHTML = `
          <h4>How to Interact</h4>
          <ul>
            ${this.currentExhibit.config.instructions.map(i => `<li>${i}</li>`).join('')}
          </ul>
        `;
      }

      // Show exhibit view
      this.galleryView.style.display = 'none';
      this.exhibitView.style.display = 'flex';

      // Wait for layout to settle before starting exhibit
      // This ensures the container has proper dimensions
      requestAnimationFrame(() => {
        // Recalculate dimensions now that view is visible
        if (this.currentExhibit.resize) {
          this.currentExhibit.resize();
        }

        // Start the exhibit
        if (this.currentExhibit.start) {
          this.currentExhibit.start();
        }

        // Hide loading after exhibit starts rendering
        setTimeout(() => this.hideLoading(), 50);
      });

    } catch (error) {
      console.error('Error loading exhibit:', error);
      this.hideLoading();
      this.navigateTo('/');
    }
  }

  showGallery() {
    // Cleanup current exhibit
    if (this.currentExhibit) {
      this.exhibitLoader.unloadExhibit(this.currentExhibit);
      this.currentExhibit = null;
    }

    // Show gallery
    this.exhibitView.style.display = 'none';
    this.galleryView.style.display = 'flex';
    this.hideLoading();

    // Update page title
    document.title = 'AIRT - AI-Generated Visual Art';
  }

  showLoading() {
    this.loading.style.display = 'flex';
  }

  hideLoading() {
    this.loading.style.display = 'none';
  }

  navigateTo(path) {
    // Update browser history
    if (path !== this.currentRoute) {
      window.history.pushState({}, '', path);
      this.handleRoute(path);
    }
  }
}

// Info panel toggle
document.getElementById('info-btn')?.addEventListener('click', () => {
  const infoPanel = document.getElementById('exhibit-info');
  if (infoPanel) {
    infoPanel.style.display = infoPanel.style.display === 'none' ? 'flex' : 'none';
  }
});

document.getElementById('info-close')?.addEventListener('click', () => {
  const infoPanel = document.getElementById('exhibit-info');
  if (infoPanel) {
    infoPanel.style.display = 'none';
  }
});

// Initialize router when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.router = new Router();
  });
} else {
  window.router = new Router();
}

export { Router };
