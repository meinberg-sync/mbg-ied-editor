import { LitElement, html, css } from 'lit';
import { property, query } from 'lit/decorators.js';

import { MdDialog } from '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';

export class IedSearchHelp extends LitElement {
  @property({ type: Boolean }) open = false;

  @query('md-dialog') dialog!: MdDialog;

  protected updated(changed: Map<string, unknown>) {
    if (changed.has('open') && this.open) {
      this.dialog?.show();
    }
  }

  private close() {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent('close', { bubbles: true, composed: true }),
    );
  }

  render() {
    return html`
      <md-dialog @close=${this.close}>
        <span slot="headline">How to Use the IED Search Filter</span>
        <div slot="content" class="help-content">
          <section>
            <h3>Basic search</h3>
            <p>
              Type any text to match against element attributes (e.g.,
              <code>inst</code>, <code>lnClass</code>, <code>type</code>,
              <code>name</code>, <code>desc</code>, <code>cdc</code>,
              <code>fc</code>) and instantiated data values. The search field
              supports case insensitive text, and matches if the search term is
              a substring of the attribute or value.
            </p>
          </section>
          <section>
            <h3>Hierarchical search</h3>
            <p>
              Separate terms with spaces to traverse the data model level by
              level. The first token matches an LN or LN0; each subsequent token
              narrows to a matching DOI, SDI, or DAI child.
            </p>
            <p class="example">Example: <code>XCBR1 Pos stVal</code></p>
          </section>
          <section>
            <h3>Wildcard</h3>
            <p>
              Use <code>*</code> as the first token to match all parent
              elements, then narrow with further tokens.
            </p>
            <p class="example">
              Example: <code>* Pos</code> or <code>* * stVal</code>
            </p>
          </section>
          <section>
            <h3>Scope</h3>
            <p>
              <strong>All</strong> — searches both instantiated elements and the
              data type templates.
            </p>
            <p>
              <strong>Instantiated</strong> — restricts results to elements that
              have been instantiated in the IED. With no search term, shows all
              instantiated data.
            </p>
            <p>
              Note that to properly search for instantiated elements, the text
              should either match against attributes of elements that are inside
              the IED (<code>inst</code>, <code>lnClass</code>,
              <code>lnType</code>, <code>name</code>, <code>desc</code>) or the
              instantiated values.
            </p>
          </section>
        </div>
        <md-text-button
          slot="actions"
          @click=${() => {
            this.dialog.close();
          }}
          >Close</md-text-button
        >
      </md-dialog>
    `;
  }

  static styles = css`
    :host {
      --md-text-button-container-shape: 0px;
    }

    .help-content {
      font-family: var(--oscd-theme-text-font);
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: 400px;
    }

    .help-content h3 {
      margin: 0 0 0.25rem;
      font-size: 16px;
      color: var(--oscd-primary);
    }

    .help-content p {
      margin: 0.5rem 0;
      font-size: 14px;
      line-height: 1.5;
    }

    .help-content code {
      font-family: monospace;
      background: var(--oscd-base2);
      padding: 0.1em 0.35em;
      border-radius: 4px;
      font-size: 12px;
    }
  `;
}

customElements.define('ied-search-help', IedSearchHelp);
