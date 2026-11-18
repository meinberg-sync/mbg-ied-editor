import { LitElement, html, css, TemplateResult } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { classMap } from 'lit/directives/class-map.js';

import { MdDialog } from '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';
import '@material/web/textfield/outlined-text-field.js';

export type EditField = {
  label: string;
  attribute: string;
  value: string;
  optional?: boolean;
  type?: 'text' | 'number' | 'textarea';
  min?: string;
  maxLength?: string;
  pattern?: RegExp;
  dependsOn?: string[];
  validate?: (value: string, values: Record<string, string>) => string | null;
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
    const value = this.values[field.attribute] ?? '';
    let error: string | null = null;

    if (value === '') {
      if (!field.optional) {
        error = `${field.label} cannot be empty!`;
      }
    } else if (field.maxLength && value.length > Number(field.maxLength)) {
      error = `${field.label} exceeds the character limit.`;
    } else if (field.pattern && !field.pattern.test(value)) {
      error = `${field.label} has an invalid format.`;
    } else {
      error = field.validate?.(value, this.values) ?? null;
    }

    this.errors = { ...this.errors, [field.attribute]: error ?? '' };
  }

  private validateWithDeps(field: EditField) {
    this.validateField(field);
    this.fields
      .filter(f => f.dependsOn?.includes(field.attribute))
      .forEach(f => this.validateField(f));
  }

  private handleSave() {
    this.fields.forEach(f => this.validateField(f));
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

  private handleInput(e: Event, field: EditField) {
    const { value } = e.target as HTMLInputElement;
    this.values = { ...this.values, [field.attribute]: value };

    const errorDeps = this.fields.some(
      f => f.dependsOn?.includes(field.attribute) && this.errors[f.attribute],
    );

    if (this.errors[field.attribute] || errorDeps) {
      this.validateWithDeps(field);
    }
  }

  private renderField(field: EditField) {
    const errorMsg = this.errors[field.attribute] ?? '';

    return html`
      <md-outlined-text-field
        class=${classMap({
          'desc-textarea': field.attribute === 'desc',
        })}
        label=${field.label}
        type=${field.type ?? 'text'}
        min=${ifDefined(field.min)}
        maxLength=${ifDefined(field.maxLength)}
        .value=${this.values[field.attribute] ?? ''}
        ?error=${!!errorMsg}
        .errorText=${errorMsg}
        @input=${(e: Event) => this.handleInput(e, field)}
        @change=${() => this.validateWithDeps(field)}
      ></md-outlined-text-field>
    `;
  }

  render(): TemplateResult {
    return html`
      <md-dialog id="edit-dialog" @closed=${this.handleClosed}>
        <div slot="headline">${this.headline}</div>
        <form slot="content" id="edit-form">
          ${repeat(
            this.fields,
            field => field.attribute,
            field => this.renderField(field),
          )}
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
      gap: var(--mbg-gap-md);
      min-width: 320px;
    }

    md-outlined-text-field {
      --md-outlined-text-field-top-space: var(--mbg-space);
      --md-outlined-text-field-bottom-space: var(--mbg-space);
      --md-outlined-text-field-container-shape: var(--mbg-shape);

      width: 100%;
      min-height: 40px;
    }

    .desc-textarea {
      resize: vertical;
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
