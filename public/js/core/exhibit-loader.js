// Exhibit Loader - Dynamically loads and manages exhibits

export class ExhibitLoader {
  constructor() {
    this.registry = null;
    this.container = document.getElementById('exhibit-container');
    this.loadedScripts = new Set();
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

      // Dynamically load libraries if needed
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
    const promises = [];

    // p5.js
    if (config.library === 'p5' && !this.loadedScripts.has('p5')) {
      promises.push(this.loadScript('p5', 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js', '/lib/p5.min.js', 'p5'));
    }

    // dat.GUI
    if (config.controls === 'dat.gui' && !this.loadedScripts.has('dat.gui')) {
      promises.push(this.loadScript('dat.gui', 'https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js', '/lib/dat.gui.min.js', 'dat'));
    }

    await Promise.all(promises);
  }

  loadScript(id, cdnUrl, fallbackUrl, globalName) {
    return new Promise((resolve, reject) => {
      if (this.loadedScripts.has(id)) {
        // If script is already loaded, check for global again just in case
        if (globalName && !window[globalName]) {
          // This case should be rare, but handles if the script tag is there but didn't execute
          this.pollForGlobal(globalName, resolve, () => reject(new Error(`${globalName} not found after script was loaded.`)));
        } else {
          resolve();
        }
        return;
      }

      const onScriptLoad = () => {
        this.loadedScripts.add(id);
        if (globalName) {
          this.pollForGlobal(globalName, resolve, () => reject(new Error(`${globalName} not found after script load.`)));
        } else {
          resolve();
        }
      };

      const script = document.createElement('script');
      script.src = cdnUrl;

      script.onload = () => {
        console.log(`Loaded ${id} from CDN`);
        onScriptLoad();
      };

      script.onerror = () => {
        console.warn(`CDN for ${id} failed, loading fallback...`);
        const fallbackScript = document.createElement('script');
        fallbackScript.src = fallbackUrl;

        fallbackScript.onload = () => {
          console.log(`Loaded ${id} from fallback`);
          onScriptLoad();
        };

        fallbackScript.onerror = () => {
          console.error(`Failed to load ${id} from CDN and fallback.`);
          reject(new Error(`Failed to load script: ${id}`));
        };

        document.head.appendChild(fallbackScript);
      };

      document.head.appendChild(script);
    });
  }

  pollForGlobal(globalName, onFound, onTimeout, timeout = 5000) {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (window[globalName]) {
        clearInterval(interval);
        onFound();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        onTimeout();
      }
    }, 50);
  }
}
