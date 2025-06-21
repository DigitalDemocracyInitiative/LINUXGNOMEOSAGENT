import St from 'gi://St';
import GLib from 'gi://GLib';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

export default class GnomeAIAssistant extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
    }

    enable() {
        this._indicator = new St.Label({ text: _("Hello, World!") });
        // Add the indicator to the panel (top bar)
        // Note: This is a very basic example. A real extension would likely use PanelMenu.Button or similar.
        // For demonstration, we'll just log to the console.
        log(`[${this.metadata.name}] enabled`);

        // A more typical way to add an indicator (requires more setup):
        // Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        log(`[${this.metadata.name}] disabled`);
        if (this._indicator) {
            // Main.panel.remove_actor(this._indicator); // If it was added to the panel
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
