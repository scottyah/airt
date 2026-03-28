// Gallery View - Landing page with exhibit cards

/**
 * ⚡ Bolt: Debounce Optimization
 * Prevents a function from firing too rapidly.
 * On the search input, this avoids expensive DOM re-renders on every keystroke,
 * improving UI responsiveness by only filtering after the user stops typing.
 * @param {Function} func The function to debounce.
 * @param {number} delay The debounce delay in milliseconds.
 */
function debounce(func, delay = 300) {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

class Gallery {
  constructor() {
    this.exhibits = [];
    this.filteredExhibits = [];
    this.currentCategory = 'all';
    this.searchQuery = '';

    this.galleryGrid = document.getElementById('gallery-grid');
    this.searchInput = document.getElementById('search-input');
    this.categoryFilters = document.getElementById('category-filters');

    this.init();
  }

  async init() {
    // Load exhibits from registry
    await this.loadExhibits();

    // Set up event listeners
    this.setupEventListeners();

    // Initial render
    this.render();
  }

  async loadExhibits() {
    try {
      // Load registry
      const registryResponse = await fetch('/js/exhibits/registry.json');
      const registry = await registryResponse.json();

      // Load config for each exhibit
      const exhibitPromises = registry.exhibits
        .filter(e => e.enabled !== false)
        .map(async (exhibitRef) => {
          try {
            const configResponse = await fetch(`/js/exhibits/${exhibitRef.id}/config.json`);
            const config = await configResponse.json();
            return config;
          } catch (error) {
            console.error(`Failed to load config for ${exhibitRef.id}:`, error);
            return null;
          }
        });

      this.exhibits = (await Promise.all(exhibitPromises)).filter(e => e !== null);
      this.filteredExhibits = [...this.exhibits];

      console.log('Loaded exhibits:', this.exhibits);
    } catch (error) {
      console.error('Failed to load exhibits:', error);
      this.exhibits = [];
      this.filteredExhibits = [];
    }
  }

  setupEventListeners() {
    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener('input', debounce((e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.filterExhibits();
      }));
    }

    // Category filters
    if (this.categoryFilters) {
      this.categoryFilters.addEventListener('click', (e) => {
        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
          // Update active state
          this.categoryFilters.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
          });
          filterBtn.classList.add('active');

          // Update current category
          this.currentCategory = filterBtn.dataset.category;
          this.filterExhibits();
        }
      });
    }
  }

  filterExhibits() {
    this.filteredExhibits = this.exhibits.filter(exhibit => {
      // Category filter
      const categoryMatch = this.currentCategory === 'all' ||
                           exhibit.category === this.currentCategory;

      // Search filter
      const searchMatch = this.searchQuery === '' ||
                         exhibit.title.toLowerCase().includes(this.searchQuery) ||
                         exhibit.description.toLowerCase().includes(this.searchQuery) ||
                         (exhibit.tags && exhibit.tags.some(tag =>
                           tag.toLowerCase().includes(this.searchQuery)));

      return categoryMatch && searchMatch;
    });

    this.render();
  }

  render() {
    if (!this.galleryGrid) return;

    this.galleryGrid.innerHTML = '';

    if (this.filteredExhibits.length === 0) {
      this.renderEmptyState();
      return;
    }

    this.filteredExhibits.forEach(exhibit => {
      const card = this.createExhibitCard(exhibit);
      this.galleryGrid.appendChild(card);
    });
  }

  createExhibitCard(exhibit) {
    const card = document.createElement('div');
    card.className = 'exhibit-card';
    card.dataset.exhibitId = exhibit.id;

    // Thumbnail
    const thumbnail = document.createElement('div');
    thumbnail.className = 'card-thumbnail';
    thumbnail.innerHTML = `
      <img src="${exhibit.thumbnail}" alt="${exhibit.title}" loading="lazy"
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%231e1e2e%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23666%22 font-family=%22sans-serif%22 font-size=%2220%22%3E${exhibit.title}%3C/text%3E%3C/svg%3E'">
      <span class="card-category ${exhibit.category}">${this.getCategoryLabel(exhibit.category)}</span>
    `;
    card.appendChild(thumbnail);

    // Content
    const content = document.createElement('div');
    content.className = 'card-content';
    content.innerHTML = `
      <h3 class="card-title">${exhibit.title}</h3>
      <p class="card-description">${exhibit.description}</p>
      ${exhibit.tags ? `
        <div class="card-tags">
          ${exhibit.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      ` : ''}
    `;
    card.appendChild(content);

    // Click to navigate
    card.addEventListener('click', () => {
      if (window.router) {
        window.router.navigateTo(`/${exhibit.id}`);
      } else {
        window.location.href = `/${exhibit.id}`;
      }
    });

    return card;
  }

  getCategoryLabel(category) {
    const labels = {
      'fractal': 'Fractal',
      'generative': 'Generative',
      '3d': '3D',
      'interactive': 'Interactive',
      'emotive': 'Emotive',
      'synthesis': 'Synthesis'
    };
    return labels[category] || category;
  }

  renderEmptyState() {
    this.galleryGrid.innerHTML = `
      <div class="gallery-empty">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3>No exhibits found</h3>
        <p>Try adjusting your filters or search query</p>
      </div>
    `;
  }
}

// Initialize gallery when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.gallery = new Gallery();
  });
} else {
  window.gallery = new Gallery();
}

export { Gallery };
