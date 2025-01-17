import {
    PluginSettingTab,
    Setting,
    App,
    ButtonComponent,
    Modal,
    TextComponent,
    Notice
} from "obsidian";
import {
    Admonition,
    AdmonitionIconDefinition,
    AdmonitionIconName,
    AdmonitionIconType,
    ObsidianAdmonitionPlugin
} from "./@types";

import {
    getAdmonitionElement,
    getIconNode,
    getIconType,
    WARNING_ICON
} from "./util";
import { iconNames } from "./util";
import { ADD_COMMAND_NAME, REMOVE_COMMAND_NAME } from "./util";

import { IconSuggestionModal } from "./modal";

/** Taken from https://stackoverflow.com/questions/34849001/check-if-css-selector-is-valid/42149818 */
const isSelectorValid = ((dummyElement) => (selector: string) => {
    try {
        dummyElement.querySelector(selector);
    } catch {
        return false;
    }
    return true;
})(document.createDocumentFragment());

export default class AdmonitionSetting extends PluginSettingTab {
    plugin: ObsidianAdmonitionPlugin;
    constructor(app: App, plugin: ObsidianAdmonitionPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    async display(): Promise<void> {
        let { containerEl } = this;

        containerEl.empty();
        containerEl.addClass("admonition-settings")
        containerEl.createEl("h2", { text: "Admonition Settings" });

        let syntax = new Setting(containerEl)
            .setDesc(
                "Use Obsidian's markdown syntax highlighter in admonition code blocks. This setting is experimental and could cause errors."
            )
            .addToggle((t) => {
                t.setValue(this.plugin.data.syntaxHighlight);
                t.onChange(async (v) => {
                    this.plugin.data.syntaxHighlight = v;
                    if (v) {
                        this.plugin.turnOnSyntaxHighlighting();
                    } else {
                        this.plugin.turnOffSyntaxHighlighting();
                    }
                    await this.plugin.saveSettings();
                });
            });
        let name = syntax.nameEl.createDiv();
        name.appendChild(WARNING_ICON.cloneNode(true));
        name.appendChild(createSpan({ text: " Markdown Syntax Highlighting" }));

        let sync = new Setting(containerEl)
            .setDesc(
                "Try to sync internal links to the metadata cache to display in graph view. This setting could have unintended consequences. Use at your own risk."
            )
            .addToggle((t) => {
                t.setValue(this.plugin.data.syncLinks).onChange(async (v) => {
                    this.plugin.data.syncLinks = v;
                    this.display();
                    await this.plugin.saveSettings();
                });
            });

        let syncName = sync.nameEl.createDiv();
        syncName.appendChild(WARNING_ICON.cloneNode(true));
        syncName.appendChild(
            createSpan({ text: " Sync Links to Metadata Cache" })
        );

        let markdown = new Setting(containerEl)
            /* .setDesc(
                "Allows admonitions to be created using `!!! ad-<type>` or `??? ad-<type>`, instead of using a code block."
            ) */
            .addToggle((t) => {
                t.setValue(this.plugin.data.enableMarkdownProcessor).onChange(
                    async (v) => {
                        this.plugin.data.enableMarkdownProcessor = v;
                        if (v) {
                            this.plugin.enableMarkdownProcessor();
                        } else {
                            this.plugin.disableMarkdownProcessor();
                        }
                        this.display();
                        await this.plugin.saveSettings();
                    }
                );
            });
        markdown.descEl.createSpan({
            text: "Allows admonitions to be created using "
        });
        markdown.descEl.createEl("code", { text: "!!! ad-<type>" });
        markdown.descEl.createSpan({
            text: " or "
        });
        markdown.descEl.createEl("code", { text: "??? ad-<type>" });
        markdown.descEl.createSpan({
            text: ", instead of using a code block."
        });
        let markdownName = markdown.nameEl.createDiv();
        markdownName.appendChild(WARNING_ICON.cloneNode(true));
        markdownName.appendChild(
            createSpan({ text: " Enable Non-codeblock Admonitions" })
        );

        const collapeSetting = new Setting(containerEl)
            .setName("Collapsible by Default")

            .addToggle((t) => {
                t.setValue(this.plugin.data.autoCollapse).onChange(
                    async (v) => {
                        this.plugin.data.autoCollapse = v;
                        this.display();
                        await this.plugin.saveSettings();
                    }
                );
            });
        collapeSetting.descEl.createSpan({
            text: "All admonitions will be collapsible by default. Use "
        });
        collapeSetting.descEl.createEl("code", { text: "collapse: none" });
        collapeSetting.descEl.createSpan({
            text: " to prevent."
        });
        if (this.plugin.data.autoCollapse) {
            new Setting(containerEl)
                .setName("Default Collapse Type")
                .setDesc(
                    "Collapsible admonitions will be either opened or closed."
                )
                .addDropdown((d) => {
                    d.addOption("open", "open");
                    d.addOption("closed", "closed");
                    d.setValue(this.plugin.data.defaultCollapseType);
                    d.onChange(async (v: "open" | "closed") => {
                        this.plugin.data.defaultCollapseType = v;
                        await this.plugin.saveSettings();
                    });
                });
        }
        new Setting(containerEl)
            .setName("Add Copy Button")
            .setDesc("Add a 'copy content' button to admonitions.")
            .addToggle((t) => {
                t.setValue(this.plugin.data.copyButton);
                t.onChange(async (v) => {
                    this.plugin.data.copyButton = v;

                    if (!v) {
                        document
                            .querySelectorAll(".admonition-content-copy")
                            .forEach((el) => {
                                el.detach();
                            });
                    }

                    await this.plugin.saveSettings();
                });
            });

        const additionalContainer = containerEl.createDiv(
            "admonition-setting-additional-container"
        );
        new Setting(additionalContainer)
            .setName("Add New")
            .setDesc("Add a new Admonition type.")
            .addButton((button: ButtonComponent): ButtonComponent => {
                let b = button
                    .setTooltip("Add Additional")
                    .setButtonText("+")
                    .onClick(async () => {
                        let modal = new SettingsModal(this.app);

                        modal.onClose = async () => {
                            if (modal.saved) {
                                this.plugin.addAdmonition({
                                    type: modal.type,
                                    color: modal.color,
                                    icon: modal.icon,
                                    command: false
                                });
                                this.display();
                            }
                        };

                        modal.open();
                    });

                return b;
            });

        const additional = additionalContainer.createDiv("additional");
        for (let a in this.plugin.data.userAdmonitions) {
            const admonition = this.plugin.data.userAdmonitions[a];

            let setting = new Setting(additional);

            let admonitionElement = await getAdmonitionElement(
                admonition.type,
                admonition.type[0].toUpperCase() +
                    admonition.type.slice(1).toLowerCase(),
                admonition.icon,
                admonition.color
            );
            setting.infoEl.replaceWith(admonitionElement);

            if (!admonition.command) {
                setting.addExtraButton((b) => {
                    b.setIcon(ADD_COMMAND_NAME.toString())
                        .setTooltip("Register Commands")
                        .onClick(async () => {
                            this.plugin.registerCommandsFor(admonition);
                            await this.plugin.saveSettings();
                            this.display();
                        });
                });
            } else {
                setting.addExtraButton((b) => {
                    b.setIcon(REMOVE_COMMAND_NAME.toString())
                        .setTooltip("Unregister Commands")
                        .onClick(async () => {
                            this.plugin.unregisterCommandsFor(admonition);
                            await this.plugin.saveSettings();
                            this.display();
                        });
                });
            }

            setting
                .addExtraButton((b) => {
                    b.setIcon("pencil")
                        .setTooltip("Edit")
                        .onClick(() => {
                            let modal = new SettingsModal(this.app, admonition);

                            modal.onClose = async () => {
                                if (modal.saved) {
                                    const hasCommand = admonition.command;
                                    this.plugin.removeAdmonition(admonition);
                                    this.plugin.addAdmonition({
                                        type: modal.type,
                                        color: modal.color,
                                        icon: modal.icon,
                                        command: hasCommand
                                    });
                                    this.display();
                                }
                            };

                            modal.open();
                        });
                })
                .addExtraButton((b) => {
                    b.setIcon("trash")
                        .setTooltip("Delete")
                        .onClick(() => {
                            this.plugin.removeAdmonition(admonition);
                            this.display();
                        });
                });
        }

        const div = containerEl.createDiv("coffee");
        div.createEl("a", {
            href: "https://www.buymeacoffee.com/valentine195"
        }).createEl("img", {
            attr: {
                src: "https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=☕&slug=valentine195&button_colour=e3e7ef&font_colour=262626&font_family=Inter&outline_colour=262626&coffee_colour=ff0000"
            }
        });
    }
}

class SettingsModal extends Modal {
    color: string = "#7d7d7d";
    icon: AdmonitionIconDefinition = {};
    type: string = "";
    saved: boolean = false;
    error: boolean = false;
    constructor(app: App, admonition?: Admonition) {
        super(app);
        if (admonition) {
            this.color = admonition.color;
            this.icon = admonition.icon;
            this.type = admonition.type;
        }
    }

    async display() {
        let { contentEl } = this;

        contentEl.empty();

        const settingDiv = contentEl.createDiv();

        let admonitionPreview = await getAdmonitionElement(
            this.type,
            this.type.length
                ? this.type[0].toUpperCase() + this.type.slice(1).toLowerCase()
                : "...",
            this.icon,
            this.color
        );
        admonitionPreview.createDiv("admonition-content").createEl("p", {
            text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla et euismod nulla."
        });

        contentEl.appendChild(admonitionPreview);
        let typeText: TextComponent;
        const typeSetting = new Setting(settingDiv)
            .setName("Admonition Type")
            /* .setDesc("This is used to create the admonition (e.g., note or abstract)") */

            .addText((text) => {
                typeText = text;
                typeText.setValue(this.type).onChange((v) => {
                    if (!v.length) {
                        SettingsModal.setValidationError(
                            text,
                            "Admonition type cannot be empty."
                        );
                        return;
                    }

                    if (v.includes(" ")) {
                        SettingsModal.setValidationError(
                            text,
                            "Admonition type cannot include spaces."
                        );
                        return;
                    }

                    if (!isSelectorValid(v)) {
                        SettingsModal.setValidationError(
                            text,
                            "Types must be a valid CSS selector."
                        );
                        return;
                    }

                    SettingsModal.removeValidationError(text);

                    this.type = v;
                    let titleSpan = admonitionPreview.querySelector(
                        ".admonition-title-content"
                    );

                    let iconEl = admonitionPreview.querySelector(
                        ".admonition-title-icon"
                    );
                    titleSpan.textContent =
                        this.type[0].toUpperCase() +
                        this.type.slice(1).toLowerCase();
                    titleSpan.prepend(iconEl);
                });
            });

        typeSetting.descEl.createSpan({
            text: "This is used to create the admonition (e.g.,  "
        });
        typeSetting.descEl.createEl("code", {
            text: "note"
        });
        typeSetting.descEl.createSpan({
            text: " or "
        });
        typeSetting.descEl.createEl("code", {
            text: "abstract"
        });
        typeSetting.descEl.createSpan({
            text: ")"
        });

        let iconText: TextComponent;
        const iconSetting = new Setting(settingDiv)
            .setName("Admonition Icon")
            .addText((text) => {
                iconText = text;
                text.setValue(this.icon.name);

                const validate = async () => {
                    const v = text.inputEl.value;
                    let ic = getIconType(v);
                    if (!ic) {
                        SettingsModal.setValidationError(
                            text,
                            "Invalid icon name."
                        );
                        return;
                    }

                    if (v.length == 0) {
                        SettingsModal.setValidationError(
                            text,
                            "Icon cannot be empty."
                        );
                        return;
                    }

                    SettingsModal.removeValidationError(text);

                    this.icon = {
                        name: v as AdmonitionIconName,
                        type: ic as AdmonitionIconType
                    };

                    let iconEl = admonitionPreview.querySelector(
                        ".admonition-title-icon"
                    );

                    iconEl.innerHTML = getIconNode(this.icon).outerHTML;
                };

                const modal = new IconSuggestionModal(
                    this.app,
                    text,
                    iconNames
                );

                modal.onClose = validate;

                text.inputEl.onblur = validate;
            });

        const desc = iconSetting.descEl.createDiv();
        desc.createEl("a", {
            text: "Font Awesome Icon",
            href: "https://fontawesome.com/icons?d=gallery&p=2&s=solid&m=free",
            attr: {
                tabindex: -1
            }
        });
        desc.createSpan({ text: " or " });
        desc.createEl("a", {
            text: "RPG Awesome Icon",
            href: "https://nagoshiashumari.github.io/Rpg-Awesome/",
            attr: {
                tabindex: -1
            }
        });
        desc.createSpan({ text: " to use next to the title." });

        const color = new Setting(settingDiv).setName("Color");
        color.controlEl.createEl(
            "input",
            {
                type: "color",
                value: rgbToHex(this.color)
            },
            (el) => {
                el.value = rgbToHex(this.color);
                el.oninput = ({ target }) => {
                    let color = hexToRgb((target as HTMLInputElement).value);

                    if (!color) return;
                    this.color = `${color.r}, ${color.g}, ${color.b}`;
                    admonitionPreview.setAttribute(
                        "style",
                        `--admonition-color: ${this.color};`
                    );
                };
            }
        );

        let footerEl = contentEl.createDiv();
        let footerButtons = new Setting(footerEl);
        footerButtons.addButton((b) => {
            b.setTooltip("Save")
                .setIcon("checkmark")
                .onClick(async () => {
                    let error = false;
                    if (!typeText.inputEl.value.length) {
                        SettingsModal.setValidationError(
                            typeText,
                            "Admonition type cannot be empty."
                        );
                        error = true;
                    }

                    if (typeText.inputEl.value.includes(" ")) {
                        SettingsModal.setValidationError(
                            typeText,
                            "Admonition type cannot include spaces."
                        );
                        error = true;
                    }

                    if (!isSelectorValid(typeText.inputEl.value)) {
                        SettingsModal.setValidationError(
                            typeText,
                            "Types must be a valid CSS selector."
                        );
                        error = true;
                    }

                    if (!getIconType(iconText.inputEl.value)) {
                        SettingsModal.setValidationError(
                            iconText,
                            "Invalid icon name."
                        );
                        error = true;
                    }

                    if (iconText.inputEl.value.length == 0) {
                        SettingsModal.setValidationError(
                            iconText,
                            "Icon cannot be empty."
                        );
                        error = true;
                    }

                    if (error) {
                        new Notice("Fix errors before saving.");
                        return;
                    }
                    this.saved = true;
                    this.close();
                });
            return b;
        });
        footerButtons.addExtraButton((b) => {
            b.setIcon("cross")
                .setTooltip("Cancel")
                .onClick(() => {
                    this.saved = false;
                    this.close();
                });
            return b;
        });
    }
    onOpen() {
        this.display();
    }

    static setValidationError(textInput: TextComponent, message?: string) {
        textInput.inputEl.addClass("is-invalid");
        if (message) {
            textInput.inputEl.parentElement.addClasses([
                "has-invalid-message",
                "unset-align-items"
            ]);
            textInput.inputEl.parentElement.parentElement.addClass(
                ".unset-align-items"
            );
            let mDiv = textInput.inputEl.parentElement.querySelector(
                ".invalid-feedback"
            ) as HTMLDivElement;

            if (!mDiv) {
                mDiv = createDiv({ cls: "invalid-feedback" });
            }
            mDiv.innerText = message;
            mDiv.insertAfter(textInput.inputEl);
        }
    }
    static removeValidationError(textInput: TextComponent) {
        textInput.inputEl.removeClass("is-invalid");
        textInput.inputEl.parentElement.removeClasses([
            "has-invalid-message",
            "unset-align-items"
        ]);
        textInput.inputEl.parentElement.parentElement.removeClass(
            ".unset-align-items"
        );

        if (textInput.inputEl.parentElement.children[1]) {
            textInput.inputEl.parentElement.removeChild(
                textInput.inputEl.parentElement.children[1]
            );
        }
    }
}

function hexToRgb(hex: string) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16)
          }
        : null;
}
function componentToHex(c: number) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}
function rgbToHex(rgb: string) {
    let result = /^(\d+),\s?(\d+),\s?(\d+)/i.exec(rgb);
    if (!result || !result.length) {
        return "";
    }
    return `#${componentToHex(Number(result[1]))}${componentToHex(
        Number(result[2])
    )}${componentToHex(Number(result[3]))}`;
}
