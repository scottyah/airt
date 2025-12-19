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
