# Browser Feedback and Notifications

## Behavior

Cagnard shows storage-browser success and error feedback as fixed toast notifications instead of inline banners above the file list. This keeps the file table in a stable position while the user is clicking, so a disappearing message cannot turn a click into an accidental file or directory open.

Toasts are used for:

- operation success messages such as save, delete, upload, download, pasteboard, and transfer updates
- operation errors such as inaccessible URL locations, clipboard failures, provider errors, and authorization failures
- breadcrumb copy-path feedback

Toasts auto-dismiss after a short delay and can be manually dismissed. Error toasts stay visible longer than success toasts.

## Accessibility

The toast viewport uses live-region semantics and does not steal focus from the browser, modals, or file openers. Each toast has a keyboard-accessible dismiss button.

## Operational Notes

- File opener-specific errors still render inside the opener surface because they are part of that file's content workflow.
- Browser action dialogs remain app-owned modals when explicit user input or confirmation is required.
- Toasts are frontend-only feedback and are not persisted.
