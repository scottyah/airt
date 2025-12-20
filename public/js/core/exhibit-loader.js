// Exhibit Loader - Dynamically loads and manages exhibits

export class ExhibitLoader {
  constructor() {
    this.registry = null;
    this.container = document.getElementById('exhibit-container');
    this.loadRegistry();
  }

  async loadRegistry() {
    try {
      const response = await fetch('/js/exhibits/registry.json');
      this.registry = await response.json();
      console.log('Loaded exhibit registry:', this.registry);
    } catch (error) {
      console.error('Failed to load exhibit registry:', error);
      this.registry = { exhibits: [] };
    }
  }

  async getExhibitConfig(exhibitId) {
    // Wait for registry to load if not loaded yet
    if (!this.registry) {
      await this.loadRegistry();
    }

    const exhibit = this.registry.exhibits.find(e => e.id === exhibitId);
    if (!exhibit) {
      console.error(`Exhibit "${exhibitId}" not found in registry`);
      return null;
    }

    try {
      // Load config.json for the exhibit
      const configResponse = await fetch(`/js/exhibits/${exhibitId}/config.json`);
      const config = await configResponse.json();
      return config;
    } catch (error) {
      console.error(`Failed to load config for exhibit "${exhibitId}":`, error);
      return null;
    }
  }

  async loadExhibit(exhibitId) {
    try {
      // Get exhibit configuration
      const config = await this.getExhibitConfig(exhibitId);
      if (!config) {
        return null;
      }

      // Load dependencies based on config
      await this.loadDependencies(config);

      // Clear container
      this.container.innerHTML = '';

      // Dynamically import the exhibit module
      const module = await import(`/js/exhibits/${exhibitId}/index.js`);

      // Get the exhibit class (should be exported as default or named export)
      const ExhibitClass = module.default || module.Exhibit || module[Object.keys(module)[0]];

      if (!ExhibitClass) {
        console.error(`No exhibit class found in module for "${exhibitId}"`);
        return null;
      }

      // Create exhibit instance
      const exhibit = new ExhibitClass(this.container, config);
      exhibit.config = config;
      exhibit.id = exhibitId;

      // Initialize the exhibit
      if (exhibit.init) {
        // Allow loading indicator to render first
        await new Promise(resolve => setTimeout(resolve, 0));
        await exhibit.init();
      }

      // Handle window resize
      const resizeHandler = () => {
        if (exhibit.resize) {
          exhibit.resize();
        }
      };
      window.addEventListener('resize', resizeHandler);
      exhibit._resizeHandler = resizeHandler;

      // Update page title
      document.title = `${config.title} - AIRT`;

      console.log(`Loaded exhibit: ${exhibitId}`);
      return exhibit;

    } catch (error) {
      console.error(`Error loading exhibit "${exhibitId}":`, error);
      return null;
    }
  }

  async unloadExhibit(exhibit) {
    if (!exhibit) return;

    try {
      // Stop the exhibit
      if (exhibit.stop) {
        exhibit.stop();
      }

      // Clean up the exhibit
      if (exhibit.destroy) {
        exhibit.destroy();
      }

      // Remove resize handler
      if (exhibit._resizeHandler) {
        window.removeEventListener('resize', exhibit._resizeHandler);
      }

      // Clear container
      this.container.innerHTML = '';

      console.log(`Unloaded exhibit: ${exhibit.id}`);
    } catch (error) {
      console.error('Error unloading exhibit:', error);
    }
  }

  getExhibits() {
    return this.registry ? this.registry.exhibits : [];
  }

  async loadDependencies(config) {
    const dependencies = {
      p5: {
        src: 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js',
        fallback: '/lib/p5.min.js',
        id: 'p5-script'
      },
      dat: {
        src: 'https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js',
        fallback: '/lib/dat.gui.min.js',
        id: 'dat-gui-script'
      }
    };

    const promises = [];

    // Check for p5.js
    if (config.library === 'p5') {
      promises.push(this.loadScript(dependencies.p5));
    }

    // Check for dat.GUI (can be used with any library)
    if (config.controls === 'dat.gui') {
      promises.push(this.loadScript(dependencies.dat));
    }

    await Promise.all(promises);
  }

  loadScript({ src, fallback, id }) {
    return new Promise((resolve, reject) => {
      // If script already loaded, resolve immediately
      if (document.getElementById(id)) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.id = id;
      script.src = src;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => {
        // Fallback to local copy on CDN error
        console.warn(`Failed to load script from CDN: ${src}. Falling back to local copy.`);
        const fallbackScript = document.createElement('script');
        fallbackScript.id = id;
        fallbackScript.src = fallback;
        fallbackScript.defer = true;
        fallbackScript.onload = resolve;
        fallbackScript.onerror = reject;
        document.head.appendChild(fallbackScript);
        script.remove(); // Clean up the failed script tag
      };
      document.head.appendChild(script);
    });
  }
}
