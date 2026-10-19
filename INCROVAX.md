# INCrovax Support

Windows x64 support client based on RustDesk 1.5.0 (fada664df7a294d1d1a9ca3e7cd3637069122f17).

The Windows startup hook selects a separate INCrovax-Support profile and sets the ID server, relay server, public key and an initial click approval mode. The selected approval mode is preserved on subsequent launches. No permanent password is embedded.

First normal launch installs the client and its automatic Windows service using the existing RustDesk installer with the standard Windows elevation prompt. Installation errors stop startup and are displayed. Internal executable/service name is INCrovax-Support (no spaces, as required by the upstream installer). A Windows-runner smoke test checks installation, running automatic service, and approval-mode persistence across a service restart. The original INCrovax artwork is used for the logo and resized Windows icons.

The INCrovax Windows x64 Testbuild workflow produces an unsigned `INCrovax-Support.exe` artifact. It does not publish releases. Test on a clean Windows account before customer distribution: server values, public server not used, accept/reject request, remote input, disconnect, exit and UAC behavior. The technician can keep using the existing configured RustDesk client.

Regression surface: `src/lib.rs` registers the Windows-only module; `src/core_main.rs` calls its initialization before profile loading; the new module sets the branded profile and connection/approval settings at each start. Windows Runner metadata and icon resources change branding only. Flutter logo/icon assets change their appearance only. Network protocol, capture and input paths are unchanged.

The full matching source and RustDesk AGPL-3.0 license remain in this repository. No Windows runtime or signing validation has been completed yet.
