import { LitElement, html, css, TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';

import { MdDialog } from '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';

export class AlertDialog extends LitElement {
  @property({ type: String }) headline = 'Alert';

  @property({ type: String }) ld = '';

  @property({ type: String }) message = '';

  @property({ type: Array }) items: string[] = [];

  @property({ type: String }) confirmText = 'Confirm';

  @property({ type: String }) confirmAction = 'confirm';

  @property({ type: Boolean }) open = false;

  @query('md-dialog#alert-dialog') dialog!: MdDialog;

  protected updated(changed: Map<string, unknown>) {
    if (changed.has('open') && this.open) {
      this.dialog?.show();
    }
  }

  private close() {
    this.dispatchEvent(
      new CustomEvent('closed', { bubbles: true, composed: true }),
    );
  }

  private handleCancel = () => {
    this.dispatchEvent(
      new CustomEvent('cancel', { bubbles: true, composed: true }),
    );
    this.dialog?.close();
  };

  private handleConfirm = () => {
    this.dispatchEvent(
      new CustomEvent('confirm', { bubbles: true, composed: true }),
    );
    this.dialog?.close();
  };

  render(): TemplateResult {
    return html`
      <md-dialog id="alert-dialog" @closed=${this.close}>
        <div slot="headline">${this.headline}</div>
        <div slot="content" id="content">
          <p id="alert-message">${unsafeHTML(this.message)}</p>
          ${this.items.length > 0
            ? html`
                <p id="alert-items">
                  <strong>Also affects in logical device ${this.ld}:</strong>
                </p>
                <ul>
                  ${this.items.map(item => html`<li>${item}</li>`)}
                </ul>
              `
            : ''}
        </div>
        <div slot="actions">
          <md-text-button @click=${this.handleCancel}> Cancel </md-text-button>
          <md-text-button
            @click=${this.handleConfirm}
            class=${this.confirmAction === 'delete' ? 'delete-button' : ''}
          >
            ${this.confirmText}
          </md-text-button>
        </div>
      </md-dialog>
    `;
  }

  static styles = css`
    #content {
      color: var(--md-sys-color-on-surface-variant);
    }

    ul {
      margin: 16px 0;
      padding-left: 20px;
    }

    li {
      margin: 8px 0;
    }

    #alert-message strong {
      color: var(--oscd-primary);
    }

    .delete-button {
      --md-sys-color-primary: var(--md-sys-color-error, red);
    }

    #alert-items strong {
      color: var(--oscd-theme-error, red);
    }

    @media (prefers-color-scheme: dark) {
      #alert-items strong {
        color: #ffbf00; /* Amber color for better visibility in dark mode */
      }

      .delete-button {
        --md-sys-color-primary: #ff4500; /* OrangeRed color for better visibility in dark mode */
      }
    }
  `;
}

if (!customElements.get('mbg-alert-dialog')) {
  customElements.define('mbg-alert-dialog', AlertDialog);
}
