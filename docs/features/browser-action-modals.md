# Browser Action Modals

## Behavior

Cagnard uses app-owned modals for browser actions that need user input or confirmation. The storage browser no longer relies on native browser `prompt`, `confirm`, or `alert` dialogs for create, rename, delete, and transfer conflict decisions.

The modal layer currently supports:

- text input with inline validation for create file, create folder, and rename
- destructive confirmation for delete
- transfer conflict resolution with Skip, Keep both, and Replace choices
- keyboard focus inside the dialog, Escape cancellation, and responsive sizing

## Operational Notes

- Entry names are validated before submission so empty names and path separators are rejected in the modal.
- Delete uses a danger-styled confirmation and does not call the backend unless confirmed.
- Transfer conflicts default to a non-destructive path: Keep both when available, otherwise Skip or Cancel.
- Replace is always an explicit user action.

## Known Limitations

- Focus restoration is best effort and currently returns to the active browser surface rather than tracking every opener control.
- Long-running transfer progress is shown as pending state and final result text; detailed byte-level progress is future work.
