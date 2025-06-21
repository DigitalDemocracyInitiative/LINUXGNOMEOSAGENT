'use strict';

const { GObject, St, Clutter, GLib, Gio } = imports.gi; // Added Gio
const Soup = imports.gi.Soup;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ModalDialog = imports.ui.modalDialog; // Added ModalDialog
const Util = imports.misc.util; // Added Util for spawn

var GnomeAIAssistant = GObject.registerClass(
class GnomeAIAssistant extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'Gnome AI Assistant', false);

        this._httpSession = new Soup.Session();

        // Icon for the panel button
        let icon = new St.Icon({
            icon_name: 'edit-find-symbolic', // A generic icon, replace if you have a custom one
            style_class: 'system-status-icon gnome-ai-assistant-panel-icon' // Added custom class for panel icon
        });
        this.add_child(icon);

        // PopupMenu item that will contain the input field and button
        // The main container for our UI elements in the popup
        this._popupItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        // Add a style class to the actor of PopupBaseMenuItem to apply popup-menu-content styles
        this._popupItem.actor.add_style_class_name('popup-menu-content'); // Apply general popup styling

        // Horizontal box layout for entry and button
        let boxLayout = new St.BoxLayout({
            vertical: false,
            style_class: 'assistant-popup-main-box' // Use class from CSS for spacing/layout
        });

        // Input field
        this._inputEntry = new St.Entry({
            hint_text: 'Ask AI...',
            can_focus: true,
            x_expand: true, // Makes the entry expand
            style_class: 'assistant-input-entry' // Apply class from CSS
        });

        // "Ask AI" button
        this._askButton = new St.Button({
            label: 'Ask AI',
            can_focus: true,
            reactive: true,
            style_class: 'assistant-ask-button' // Apply class from CSS
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

    // Function to retrieve the active window title
    _getActiveWindowTextAndTitle() {
        let windowTitle = '';
        try {
            const focusWindow = global.display.focus_window;
            if (focusWindow) {
                windowTitle = focusWindow.get_title() || '';
            }
        } catch (e) {
            logError(e, 'Error retrieving active window title');
            windowTitle = ''; // Fallback to empty string in case of error
        }

        // TODO: Future Consideration - Retrieving full active window text.
        // Direct screen scraping of arbitrary window content is generally not permitted
        // in GNOME Shell extensions due to Wayland's security model, and also X11 depending on settings.
        // Potential future approaches:
        // 1. Integrate with specific applications that expose their content via D-Bus.
        // 2. Rely more on clipboard content (already being implemented).
        // 3. Accessibility APIs (e.g., AT-SPI) might offer some capabilities,
        //    but this can be complex and have performance implications.

        return windowTitle;
    }

    // Function to retrieve clipboard content
    _getClipboardContent(callback) {
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (text) {
                callback(text);
            } else {
                // log('Clipboard is empty or content is not text.');
                callback(''); // Pass empty string if clipboard is empty or not text
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

        // Get active window title
        const windowTitle = this._getActiveWindowTextAndTitle();

        // Get clipboard content (asynchronously)
        this._getClipboardContent(clipboardContent => {
            let payload = {
                text: text,
                context: {
                    active_window_title: windowTitle,
                    clipboard_content: clipboardContent
                }
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
                        // Main.notify('AI Response', parsedResponse.generated_text); // Keep this for non-action responses or change as needed

                        if (parsedResponse.requires_action === true && parsedResponse.suggested_command) {
                            this._showConfirmationDialog(parsedResponse.generated_text, parsedResponse.suggested_command);
                        } else {
                            // If no action is required, just show the text response (if any)
                            // This could be a setting or a different type of notification
                            if (parsedResponse.generated_text) {
                                Main.notify('AI Assistant', parsedResponse.generated_text);
                            }
                        }
                    } else if (parsedResponse && parsedResponse.error) {
                        Main.notifyError('AI Assistant Error', `Server error: ${parsedResponse.error}`);
                    }
                    else {
                        Main.notifyError('AI Assistant Error', 'Unexpected response format from server.');
                    }
                } catch (e) {
                    Main.notifyError('AI Assistant Error', `Error processing response: ${e.message}`);
                    logError(e, 'Error in _sendToBackend callback');
                }
            });

            this._inputEntry.set_text(''); // Clear input after sending
        });
    }

    _showConfirmationDialog(aiResponse, suggestedCommand) {
        try {
            let dialog = new ModalDialog.ModalDialog({
                styleClass: 'ai-assistant-dialog',
                destroyOnClose: true
            });

            let content = new St.BoxLayout({ vertical: true, style_class: 'spacing' });
            dialog.contentLayout.add_child(content);

            let message = new St.Label({
                text: `AI suggests: '${aiResponse}'.\nDo you want to execute: ${suggestedCommand}?`,
                style_class: 'ai-assistant-dialog-message'
            });
            message.clutter_text.line_wrap = true; // Enable text wrapping
            content.add_child(message);

            dialog.addButton({
                label: "Yes",
                action: () => {
                    this._executeCommand(suggestedCommand);
                    dialog.close(); // Close after action
                },
                key: Clutter.KEY_Return // Optional: allow Enter to confirm
            });

            dialog.addButton({
                label: "No",
                action: () => {
                    Main.notify("AI Assistant", "Command execution cancelled.");
                    dialog.close();
                },
                key: Clutter.KEY_Escape // Optional: allow Escape to cancel
            });

            dialog.open();
        } catch (e) {
            Main.notifyError('AI Assistant Error', `Failed to show confirmation dialog: ${e.message}`);
            logError(e, 'Error showing confirmation dialog');
        }
    }

    _executeCommand(command) {
        const appMap = {
            "firefox": "firefox.desktop", // Assuming .desktop files are preferred for Gio.AppInfo
            "gnome-terminal": "org.gnome.Terminal.desktop",
            "nautilus": "org.gnome.Nautilus.desktop",
            "gedit": "org.gnome.gedit.desktop",
            "gnome-control-center": "gnome-control-center.desktop",
            "gnome-calendar": "org.gnome.Calendar.desktop"
        };

        try {
            if (appMap[command]) {
                // Try to launch as a desktop application
                let appInfo = Gio.DesktopAppInfo.new(appMap[command]);
                if (appInfo) {
                    appInfo.launch([], null); // null for GLib.AppLaunchContext
                    Main.notify("AI Assistant", `Launched ${command}.`);
                } else {
                     // Fallback for simple names if .desktop lookup fails or for commands not in appMap that are simple executables
                    Util.spawn(['xdg-open', command]); // A more generic way to open things
                    Main.notify("AI Assistant", `Attempting to open ${command}.`);
                }
            } else {
                // General shell command
                // For security, be cautious with arbitrary command execution.
                // Consider if pre-validation or sandboxing is needed for production.
                // For now, splitting the command string into an array for Util.spawn.
                // This basic split won't handle complex shell syntax like pipes or quotes within arguments.
                let argv = ['/bin/sh', '-c', command]; // Wrap in sh -c to handle more complex commands
                Util.spawn(argv);
                Main.notify("AI Assistant", `Executed: ${command}`);
            }
        } catch (e) {
            Main.notifyError('AI Assistant Error', `Failed to execute command '${command}': ${e.message}`);
            logError(e, `Error executing command: ${command}`);
        }
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
