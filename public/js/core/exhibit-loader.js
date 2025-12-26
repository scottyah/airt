// Exhibit Loader - Dynamically loads and manages exhibits

export class ExhibitLoader {
  constructor() {
    this.registry = null;
    this.container = document.getElementById('exhibit-container');
    this.loadedScripts = new Map(); // Keep track of loaded scripts
    this.loadRegistry();
  }

  /**
   * Dynamically loads a script and returns a promise.
   * Prevents re-downloading if the script is already loaded.
   * @param {string} src - The primary URL for the script.
   * @param {string} fallbackSrc - A fallback URL if the primary fails.
   * @param {string} globalName - The global variable name to wait for (e.g., 'p5').
   * @returns {Promise<void>}
   */
  loadScript(src, fallbackSrc = null, globalName = null) {
    // If the script is already loaded or is being loaded, return the existing promise
    if (this.loadedScripts.has(src)) {
      return this.loadedScripts.get(src);
    }

    const promise = new Promise((resolve, reject) => {
      const primaryScript = document.createElement('script');
      primaryScript.defer = true;

      const handleLoad = async (event) => {
        const loadedSrc = event.target.src;
        console.log(`Loaded script: ${loadedSrc}`);
        if (globalName) {
          try {
            await this.waitForGlobal(globalName);
            console.log(`Global '${globalName}' is now available.`);
            resolve();
          } catch (error) {
            reject(error);
          }
        } else {
          resolve();
        }
      };

      const handleError = () => {
        console.error(`Failed to load script: ${src}`);
        primaryScript.remove(); // Clean up the failed script tag

        if (fallbackSrc) {
          console.log(`Attempting fallback: ${fallbackSrc}`);
          const fallbackScript = document.createElement('script');
          fallbackScript.defer = true;
          fallbackScript.src = fallbackSrc;
          fallbackScript.onload = handleLoad;
          fallbackScript.onerror = () => {
            fallbackScript.remove();
            console.error(`Failed to load fallback script: ${fallbackSrc}`);
            reject(new Error(`Failed to load script from ${src} and ${fallbackSrc}`));
          };
          document.head.appendChild(fallbackScript);
        } else {
          reject(new Error(`Failed to load script: ${src}`));
        }
      };

      primaryScript.onload = handleLoad;
      primaryScript.onerror = handleError;
      primaryScript.src = src;

      document.head.appendChild(primaryScript);
    });

    this.loadedScripts.set(src, promise);
    return promise;
  }

  /**
   * Waits for a global variable to be defined on the window object.
   * Useful for scripts that don't have a clear onload signal.
   * @param {string} globalName - The name of the global variable.
   * @param {number} timeout - The maximum time to wait in ms.
   * @param {number} interval - The interval to check in ms.
   * @returns {Promise<void>}
   */
  waitForGlobal(globalName, timeout = 5000, interval = 50) {
    return new Promise((resolve, reject) => {
      let elapsedTime = 0;
      const check = () => {
        if (window[globalName]) {
          resolve();
        } else {
          elapsedTime += interval;
          if (elapsedTime >= timeout) {
            reject(new Error(`Timed out waiting for global: ${globalName}`));
          } else {
            setTimeout(check, interval);
          }
        }
      };
      check();
    });
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

      // Load required libraries based on config
      const libraryPromises = [];
      if (config.library === 'p5') {
        libraryPromises.push(this.loadScript(
          'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js',
          '/lib/p5.min.js',
          'p5'
        ));
      }
      if (config.controls === 'dat.gui') {
        libraryPromises.push(this.loadScript(
          'https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js',
          '/lib/dat.gui.min.js',
          'dat'
        ));
      }
      await Promise.all(libraryPromises);

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
}
