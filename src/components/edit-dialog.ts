import { LitElement, html, css, TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';

import { MdDialog } from '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';
import '@material/web/textfield/outlined-text-field.js';

export type EditField = {
  label: string;
  attribute: string;
  value: string;
  validate?: (value: string) => string | null;
};

export class EditDialog extends LitElement {
  @property({ type: String }) headline = 'Edit';

  @property({ type: Boolean }) open = false;

  @property({ type: Array }) fields: EditField[] = [];

  @state() private values: Record<string, string> = {};

  @state() private errors: Record<string, string> = {};

  @query('md-dialog#edit-dialog') dialog!: MdDialog;

  protected updated(changed: Map<string, unknown>) {
    if (changed.has('open') && this.open) {
      this.values = Object.fromEntries(
        this.fields.map(f => [f.attribute, f.value]),
      );
      this.errors = {};
      this.dialog?.show();
    }
  }

  private get hasErrors(): boolean {
    return Object.values(this.errors).some(Boolean);
  }

  private validateField(field: EditField) {
    if (!field.validate) return;
    const error = field.validate(this.values[field.attribute] ?? '');
    this.errors = { ...this.errors, [field.attribute]: error ?? '' };
  }

  private handleSave() {
    if (this.hasErrors) return;
    this.dispatchEvent(
      new CustomEvent('save', {
        detail: { ...this.values },
        bubbles: true,
        composed: true,
      }),
    );
    this.dialog?.close();
  }

  private handleCancel() {
    this.dispatchEvent(
      new CustomEvent('cancel', { bubbles: true, composed: true }),
    );
    this.dialog?.close();
  }

  private handleClosed() {
    this.dispatchEvent(
      new CustomEvent('closed', { bubbles: true, composed: true }),
    );
  }

  private renderField(field: EditField) {
    const errorMsg = this.errors[field.attribute] ?? '';

    if (field.attribute === 'inst') {
      return html`
        <md-outlined-text-field
          label=${field.label}
          type="number"
          min="1"
          .value=${this.values[field.attribute] ?? ''}
          ?error=${!!errorMsg}
          .errorText=${errorMsg}
          @input=${(e: Event) => {
            const { value } = e.target as HTMLInputElement;
            if (/^\d*$/.test(value)) {
              this.values = { ...this.values, [field.attribute]: value };
            }
          }}
          @change=${() => this.validateField(field)}
        ></md-outlined-text-field>
      `;
    }

    return html`
      <md-outlined-text-field
        label=${field.label}
        .value=${this.values[field.attribute] ?? ''}
        ?error=${!!errorMsg}
        .errorText=${errorMsg}
        @input=${(e: Event) => {
          this.values = {
            ...this.values,
            [field.attribute]: (e.target as HTMLInputElement).value,
          };
        }}
        @change=${() => this.validateField(field)}
      ></md-outlined-text-field>
    `;
  }

  render(): TemplateResult {
    return html`
      <md-dialog id="edit-dialog" @closed=${this.handleClosed}>
        <div slot="headline">${this.headline}</div>
        <form slot="content" id="edit-form">
          ${this.fields.map(field => this.renderField(field))}
        </form>
        <div slot="actions">
          <md-text-button class="cancel" @click=${this.handleCancel}
            >Cancel</md-text-button
          >
          <md-text-button
            class="save"
            ?disabled=${this.hasErrors}
            @click=${this.handleSave}
            >Save</md-text-button
          >
        </div>
      </md-dialog>
    `;
  }

  static styles = css`
    form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 320px;
    }

    md-outlined-text-field {
      width: 100%;
    }

    .cancel {
      --md-sys-color-primary: var(--md-sys-color-error, red);
    }

    @media (prefers-color-scheme: dark) {
      .cancel {
        --md-sys-color-primary: #ff4500; /* OrangeRed color for better visibility in dark mode */
      }
    }
  `;
}

if (!customElements.get('mbg-edit-dialog')) {
  customElements.define('mbg-edit-dialog', EditDialog);
}
