import { LitElement, html, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import { identity } from '@openenergytools/scl-lib';
import {
  dataModelPathCache,
  debounce,
  getDataModel,
  getInitializedEltPath,
  matchesLNToken,
  matchesNameToken,
  pathHasPrefixAndTokens,
} from '../utils/ied-data-model.js';

import '@material/web/textfield/outlined-text-field.js';
import '@material/web/iconbutton/outlined-icon-button.js';
import '@material/web/icon/icon.js';
import '@material/web/labs/segmentedbuttonset/outlined-segmented-button-set.js';
import '@material/web/labs/segmentedbutton/outlined-segmented-button.js';

export interface SearchChangedDetail {
  searchTerm: string;
  pathsToRender: string[];
  scopeActive: boolean;
}

export class IedSearchFilter extends LitElement {
  @property({ type: Object }) doc?: Document;

  @property({ type: Object }) ied?: Element;

  @state() private searchTerm = '';

  @state() private searchScope: 'all' | 'instances' = 'all';

  @state() private searchSettingsOpen = false;

  protected updated(changed: Map<string, unknown>) {
    super.updated?.(changed);
    if (changed.has('ied') || changed.has('doc')) {
      this.searchTerm = '';
      const searchInput = this.shadowRoot?.querySelector(
        '.search-input',
      ) as HTMLInputElement | null;
      if (searchInput) searchInput.value = '';
    }
  }

  private parseSearchTokens(): string[] {
    return this.searchTerm.trim().split(/\s+/).filter(Boolean);
  }

  private searchSelectorIED(): Element[] {
    if (!this.ied) return [];

    const lowerCaseTerm = this.searchTerm.toLowerCase();
    const attributes = ['inst', 'desc', 'lnClass', 'lnType', 'name'];

    return Array.from(
      this.ied.querySelectorAll(':scope > AccessPoint > Server *'),
    ).filter(elt =>
      attributes.some(attr =>
        elt.getAttribute(attr)?.toLowerCase().includes(lowerCaseTerm),
      ),
    );
  }

  private searchSelectorIEDValues(): Element[] {
    if (!this.ied) return [];

    const lowerCaseTerm = this.searchTerm.toLowerCase();

    const matchingDais = Array.from(
      this.ied.querySelectorAll(':scope > AccessPoint > Server DAI > Val'),
    )
      .filter(val => val.textContent?.toLowerCase().includes(lowerCaseTerm))
      .map(val => val.parentElement!);

    return [...new Set(matchingDais)];
  }

  private searchSelectorTemplates(): Element[] {
    if (!this.doc) return [];

    const lowerCaseTerm = this.searchTerm.toLowerCase();
    const attributes = [
      'id',
      'lnClass',
      'desc',
      'name',
      'type',
      'cdc',
      'fc',
      'bType',
    ];

    return Array.from(
      this.doc.querySelectorAll(':root > DataTypeTemplates *'),
    ).filter(elt =>
      attributes.some(attr =>
        elt.getAttribute(attr)?.toLowerCase().includes(lowerCaseTerm),
      ),
    );
  }

  private searchHierarchicalIED(tokens: string[]): Element[] {
    if (!this.ied) return [];

    const [firstToken, ...restTokens] = tokens;

    // Start with all LN/LN0 elements matching the first token (or all if wildcard)
    let currentLevel: Element[] = Array.from(
      this.ied.querySelectorAll(
        ':scope > AccessPoint > Server > LDevice > LN, :scope > AccessPoint > Server > LDevice > LN0',
      ),
    ).filter(ln => matchesLNToken(ln, firstToken));

    // Iteratively narrow to children matching subsequent tokens
    for (const token of restTokens) {
      currentLevel = currentLevel.flatMap(parent =>
        Array.from(parent.children)
          .filter(child => ['DOI', 'SDI', 'DAI'].includes(child.tagName))
          .filter(child => matchesNameToken(child, token)),
      );

      // If no matches at this level, stop searching further
      if (currentLevel.length === 0) break;
    }

    // Return all matched elements and their descendants so the full subtree renders
    return [
      ...currentLevel,
      ...currentLevel.flatMap(el =>
        Array.from(el.querySelectorAll('DOI, SDI, DAI')),
      ),
    ];
  }

  private searchHierarchicalTemplates(tokens: string[]): string[] {
    if (!this.ied || !this.doc) return [];

    const [firstToken, ...nameTokens] = tokens;

    // Find all LN instances matching the first token to determine relevant template paths
    const lnPaths: string[] = [];
    Array.from(
      this.ied.querySelectorAll(
        ':scope > AccessPoint > Server > LDevice > LN, :scope > AccessPoint > Server > LDevice > LN0',
      ),
    )
      .filter(ln => firstToken === '*' || matchesLNToken(ln, firstToken))
      .forEach(ln => {
        const lnTypeId = ln.getAttribute('lnType');
        if (!lnTypeId) return;
        const lnType = this.doc!.querySelector(
          `:root > DataTypeTemplates > LNodeType[id="${lnTypeId}"]`,
        );
        if (!lnType) return;
        const lnPath = `${ln.tagName} ${identity(ln)}`;
        lnPaths.push(lnPath);
        getDataModel(lnType, [lnPath]);
      });

    if (lnPaths.length === 0) return [];

    // Check cached paths for all template elements against the relevant LN paths and token sequence
    const matchingPaths: string[] = [];
    Array.from(
      this.doc.querySelectorAll(':root > DataTypeTemplates *'),
    ).forEach(element => {
      const cachedPaths = dataModelPathCache.get(element) as
        | Set<string>
        | undefined;
      if (!cachedPaths || cachedPaths.size === 0) return;
      [...cachedPaths].forEach(path => {
        if (
          !matchingPaths.includes(path) &&
          lnPaths.some(lnPath =>
            pathHasPrefixAndTokens(path, lnPath, nameTokens),
          )
        ) {
          matchingPaths.push(path);
        }
      });
    });

    return matchingPaths;
  }

  private performSearch(searchTerm: string) {
    this.searchTerm = searchTerm;
    const newPathsToRender: string[] = [];
    if (!this.ied || !this.doc) return;

    const tokens = this.parseSearchTokens();
    const useTemplates = this.searchScope !== 'instances';
    const scopeActive = this.searchScope === 'instances';

    const addPath = (path: string) => {
      if (!newPathsToRender.includes(path)) newPathsToRender.push(path);
    };

    if (!searchTerm && scopeActive) {
      Array.from(
        this.ied.querySelectorAll(
          ':scope > AccessPoint > Server DOI, :scope > AccessPoint > Server SDI, :scope > AccessPoint > Server DAI',
        ),
      ).forEach(element => addPath(getInitializedEltPath(element)));
    } else if (tokens.length > 1) {
      this.searchHierarchicalIED(tokens).forEach(element => {
        if (['DOI', 'SDI', 'DAI'].includes(element.tagName)) {
          addPath(getInitializedEltPath(element));
        }
      });

      if (useTemplates) {
        this.searchHierarchicalTemplates(tokens).forEach(addPath);
      }
    } else if (searchTerm) {
      [
        ...this.searchSelectorIED(),
        ...this.searchSelectorIEDValues(),
        ...(useTemplates ? this.searchSelectorTemplates() : []),
      ].forEach(element => {
        if (element.tagName === 'LDevice') {
          addPath(identity(element) as string);
        } else if (['DOI', 'SDI', 'DAI'].includes(element.tagName)) {
          addPath(getInitializedEltPath(element));
        }

        dataModelPathCache
          .get(element)
          ?.forEach((path: string) => addPath(path));
      });
    }

    this.dispatchEvent(
      new CustomEvent<SearchChangedDetail>('search-changed', {
        detail: { searchTerm, pathsToRender: newPathsToRender, scopeActive },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private debounceSearch = debounce((...args: unknown[]) => {
    this.performSearch(args[0] as string);
  });

  private resetSearch() {
    const searchInput = this.shadowRoot?.querySelector(
      '.search-input',
    ) as HTMLInputElement;
    if (searchInput) searchInput.value = '';
    this.performSearch('');
  }

  private toggleSearchSettings() {
    this.searchSettingsOpen = !this.searchSettingsOpen;
  }

  render() {
    return html`
      <div class="search-container">
        <div
          class="${classMap({
            'search-field': true,
            'has-term': !!this.searchTerm,
          })}"
        >
          <md-icon class="search-icon" slot="leading-icon">search</md-icon>
          <md-outlined-text-field
            class="search-input"
            label="Search"
            @input=${(e: Event) => {
              const searchInput = (e.target as HTMLInputElement)?.value;
              this.debounceSearch(searchInput);
            }}
          >
          </md-outlined-text-field>
          <md-outlined-icon-button
            aria-label="Clear search"
            title="Clear search"
            class="clear-btn"
            ?disabled=${!this.searchTerm}
            @click=${() => this.resetSearch()}
          >
            <md-icon>clear</md-icon>
          </md-outlined-icon-button>
          <md-outlined-icon-button
            aria-label="Search settings"
            title="Search settings"
            @click=${() => this.toggleSearchSettings()}
            ><md-icon
              >${this.searchSettingsOpen
                ? 'filter_alt_off'
                : 'filter_alt'}</md-icon
            ></md-outlined-icon-button
          >
        </div>
        <div
          class="${classMap({
            'search-settings': true,
            open: this.searchSettingsOpen,
          })}"
        >
          <p>Scope:</p>
          <md-outlined-segmented-button-set>
            ${(
              [
                ['all', 'All'],
                ['instances', 'Instantiated'],
              ] as const
            ).map(
              ([value, label]) => html`
                <md-outlined-segmented-button
                  label=${label}
                  ?selected=${this.searchScope === value}
                  @click=${() => {
                    this.searchScope = value;
                    this.performSearch(this.searchTerm);
                  }}
                ></md-outlined-segmented-button>
              `,
            )}
          </md-outlined-segmented-button-set>
        </div>
      </div>
    `;
  }

  static styles = css`
    :host {
      --md-outlined-icon-button-size: 24px;
      --md-outlined-icon-button-container-shape: 10px;

      --md-outlined-text-field-top-space: 8px;
      --md-outlined-text-field-bottom-space: 8px;

      --md-outlined-segmented-button-container-height: 32px;

      --md-outlined-segmented-button-shape: 10px;
      --md-outlined-segmented-button-selected-container-color: var(
        --oscd-primary
      );
      --md-outlined-segmented-button-selected-label-text-color: var(
        --oscd-base3
      );
      --md-outlined-segmented-button-selected-icon-color: var(--oscd-base3);
      --md-outlined-segmented-button-selected-focus-container-color: var(
        --oscd-primary
      );
      --md-outlined-segmented-button-selected-focus-label-text-color: var(
        --oscd-base3
      );
      --md-outlined-segmented-button-selected-focus-icon-color: var(
        --oscd-base3
      );
      --md-outlined-segmented-button-selected-hover-container-color: var(
        --oscd-primary
      );
      --md-outlined-segmented-button-selected-hover-label-text-color: var(
        --oscd-base3
      );
      --md-outlined-segmented-button-selected-hover-icon-color: var(
        --oscd-base3
      );
    }

    .search-container {
      width: fit-content;
      background: var(--oscd-base3);
      border-radius: 10px;
    }

    .search-field {
      display: flex;
      align-items: center;
      width: max-content;
      padding: 0.5rem;
    }

    .search-field .search-icon {
      padding: 0 8px;
    }

    .clear-btn {
      max-width: 0;
      overflow: hidden;
      opacity: 0;
      transition:
        max-width 0.2s ease,
        opacity 0.2s ease;
    }

    .has-term .clear-btn {
      max-width: 40px;
      opacity: 1;
      margin-right: 0.5rem;
    }

    .search-input {
      width: 400px;
      min-width: 0;
      transition: width 0.2s ease;
      margin: 0 0.5rem;
    }

    .has-term .search-input {
      width: 376px;
    }

    .search-settings {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0 1rem;
      overflow: hidden;
      max-height: 0;
      transition: max-height 0.25s ease-out;
    }

    .search-settings.open {
      max-height: 4rem;
      transition: max-height 0.25s ease-in;
    }

    .search-settings p {
      font-family: var(--oscd-theme-text-font);
      font-weight: bold;
    }
  `;
}

customElements.define('ied-search-filter', IedSearchFilter);
