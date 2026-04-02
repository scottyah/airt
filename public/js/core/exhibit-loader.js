// Exhibit Loader - Dynamically loads and manages exhibits

const loadedScripts = new Map();

/**
 * Dynamically loads a script and returns a promise that resolves when it's ready.
 * Handles fallbacks, prevents re-loading, and polls for library readiness.
 * @param {string} primarySrc - The primary CDN URL.
 * @param {string} fallbackSrc - The local fallback URL.
 * @param {string} globalName - The name of the global variable to check (e.g., 'p5', 'dat').
 * @returns {Promise<void>}
 */
function loadScript(primarySrc, fallbackSrc, globalName) {
  // If script is already loaded or loading, return the existing promise
  if (loadedScripts.has(primarySrc)) {
    return loadedScripts.get(primarySrc);
  }

  // More robust check for pre-existing scripts
  let isAlreadyLoaded = false;
  if (globalName === 'p5') isAlreadyLoaded = typeof window.p5 === 'function';
  else if (globalName === 'dat') isAlreadyLoaded = typeof window.dat === 'object' && typeof window.dat.GUI === 'function';
  else if (globalName) isAlreadyLoaded = !!window[globalName];

  if (isAlreadyLoaded) {
    return Promise.resolve();
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = primarySrc;
    script.defer = true;

    const onScriptLoad = () => {
      // Poll for the global variable to ensure the library is fully initialized
      if (globalName) {
        const checkGlobal = () => {
          let isReady = false;
          if (globalName === 'p5') {
            // p5.js is ready when the p5 constructor function exists
            isReady = typeof window.p5 === 'function';
          } else if (globalName === 'dat') {
            // dat.gui is ready when the dat object and its GUI constructor exist
            isReady = typeof window.dat === 'object' && typeof window.dat.GUI === 'function';
          } else {
            // Generic check for other libraries
            isReady = !!window[globalName];
          }

          if (isReady) {
            resolve();
          } else {
            setTimeout(checkGlobal, 50); // Check again in 50ms
          }
        };
        checkGlobal();
      } else {
        resolve(); // No global to check, just resolve
      }
    };

    const onScriptError = () => {
      console.warn(`Failed to load script from ${primarySrc}. Retrying with fallback...`);
      const fallbackScript = document.createElement('script');
      fallbackScript.src = fallbackSrc;
      fallbackScript.defer = true;
      fallbackScript.onload = onScriptLoad;
      fallbackScript.onerror = () => {
        console.error(`Failed to load script from fallback ${fallbackSrc}`);
        reject(new Error(`Script loading failed for ${primarySrc}`));
      };
      document.body.appendChild(fallbackScript);
    };

    script.onload = onScriptLoad;
    script.onerror = onScriptError;

    document.body.appendChild(script);
  });

  loadedScripts.set(primarySrc, promise);
  return promise;
}


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

      // ⚡ OPTIMIZATION: Conditionally load libraries only when needed.
      // This avoids loading p5.js and dat.gui on the initial page load,
      // improving gallery load time.
      const scriptPromises = [];
      if (config.library === 'p5') {
        scriptPromises.push(loadScript(
          'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.7.0/p5.min.js',
          '/lib/p5.min.js',
          'p5'
        ));
      }
      if (config.controls === 'dat.gui') {
        scriptPromises.push(loadScript(
          'https://cdnjs.cloudflare.com/ajax/libs/dat-gui/0.7.9/dat.gui.min.js',
          '/lib/dat.gui.min.js',
          'dat'
        ));
      }
      await Promise.all(scriptPromises);


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
