'use strict';

const { GObject, St, Clutter, GLib } = imports.gi;
const Soup = imports.gi.Soup;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

var GnomeAIAssistant = GObject.registerClass(
class GnomeAIAssistant extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Gnome AI Assistant', false);

        this._httpSession = new Soup.Session();

        // Icon for the panel button
        let icon = new St.Icon({
            icon_name: 'edit-find-symbolic', // A generic icon, replace if you have a custom one
            style_class: 'system-status-icon'
        });
        this.add_child(icon);

        // PopupMenu item that will contain the input field and button
        this._popupItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });

        // Horizontal box layout for entry and button
        let boxLayout = new St.BoxLayout({ vertical: false, style_class: 'spacing' }); // Added a style_class for potential spacing

        // Input field
        this._inputEntry = new St.Entry({
            hint_text: 'Ask AI...',
            can_focus: true,
            x_expand: true, // Makes the entry expand
            style_class: 'ai-assistant-input'
        });

        // "Ask AI" button
        this._askButton = new St.Button({
            label: 'Ask AI',
            can_focus: true,
            reactive: true,
            style_class: 'ai-assistant-button button' // Added 'button' for standard theming
        });

        boxLayout.add_child(this._inputEntry);
        boxLayout.add_child(this._askButton);

        this._popupItem.add_child(boxLayout);
        this.menu.addMenuItem(this._popupItem);

        // Connect signals
        this._askButtonSignalId = this._askButton.connect('clicked', () => this._sendToBackend());
        this._inputEntrySignalId = this._inputEntry.connect('activate', () => this._sendToBackend()); // Enter key
        this._menuOpenStateSignalId = this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (isOpen) {
                this._inputEntry.grab_key_focus();
            }
        });
    }

    _sendToBackend() {
        let text = this._inputEntry.get_text();
        if (!text.trim()) {
            Main.notifyError('Input Error', 'Please enter some text.');
            return;
        }

        this.menu.close(); // Close the menu after asking

        let payload = {
            text: text,
            context: "" // Context is empty for now as per requirements
        };
        let payloadString = JSON.stringify(payload);

        let message = Soup.Message.new_from_uri('POST', GLib.Uri.parse('http://127.0.0.1:5000/process_text', GLib.UriFlags.NONE));
        if (!message) {
            Main.notifyError('AI Assistant Error', 'Failed to create request message.');
            return;
        }

        message.set_request_body_from_bytes('application/json', new GLib.Bytes(payloadString));

        this._httpSession.queue_message(message, (session, response) => {
            try {
                if (response.get_status() !== Soup.Status.OK) {
                    Main.notifyError('AI Assistant Error', `Request failed: ${response.get_reason_phrase()} (Status: ${response.get_status()})`);
                    return;
                }

                const bodyBytes = response.get_data();
                if (!bodyBytes) {
                    Main.notifyError('AI Assistant Error', 'Empty response from server.');
                    return;
                }

                const responseBody = new TextDecoder().decode(bodyBytes.get_data());
                let parsedResponse;
                try {
                    parsedResponse = JSON.parse(responseBody);
                } catch (e) {
                    Main.notifyError('AI Assistant Error', `Failed to parse response: ${e.message}`);
                    logError(e, 'Failed to parse JSON response');
                    return;
                }

                if (parsedResponse && parsedResponse.generated_text) {
                    Main.notify('AI Response', parsedResponse.generated_text);
                } else {
                    Main.notifyError('AI Assistant Error', 'Unexpected response format from server.');
                }
            } catch (e) {
                Main.notifyError('AI Assistant Error', `Error processing response: ${e.message}`);
                logError(e, 'Error in _sendToBackend callback');
            }
        });

        this._inputEntry.set_text(''); // Clear input after sending
    }

    destroy() {
        // Disconnect signals
        if (this._askButtonSignalId) this._askButton.disconnect(this._askButtonSignalId);
        if (this._inputEntrySignalId) this._inputEntry.disconnect(this._inputEntrySignalId);
        if (this._menuOpenStateSignalId) this.menu.disconnect(this._menuOpenStateSignalId);

        this._askButtonSignalId = 0;
        this._inputEntrySignalId = 0;
        this._menuOpenStateSignalId = 0;

        // Abort ongoing HTTP requests
        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }

        // Destroy UI elements explicitly if they are not automatically handled by parent destruction
        // this.menu.removeAll(); // Already handled by PanelMenu.Button's destroy
        // if (this._popupItem) this._popupItem.destroy(); // Handled by menu
        // if (this._inputEntry) this._inputEntry.destroy(); // Handled by _popupItem
        // if (this._askButton) this._askButton.destroy(); // Handled by _popupItem

        super.destroy();
    }
});

// Extension entry points
let extension = null;

function init() {
    // Called once when extension is first loaded, not enabled.
}

function enable() {
    extension = new GnomeAIAssistant();
    Main.panel.addToStatusArea('gnome-ai-assistant', extension, 1, 'right');
}

function disable() {
    if (extension) {
        extension.destroy();
        extension = null;
    }
}
