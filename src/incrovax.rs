use hbb_common::config::{self, Config};

pub fn initialize() {
    *config::APP_NAME.write().unwrap() = "INCrovax-Support".to_owned();
    for (key, value) in [
        ("custom-rendezvous-server", "support.incrovax.de"),
        ("relay-server", "support.incrovax.de:21117"),
        ("key", "1kVq4iLuQGqtAOcf2JwSx0uXPN7Q2qa8BUlK24lg7zo="),
        ("api-server", ""),
    ] {
        Config::set_option(key.to_owned(), value.to_owned());
    }
    if Config::get_option("approve-mode").is_empty() {
        Config::set_option("approve-mode".to_owned(), "click".to_owned());
    }
}

pub fn install_on_first_launch() -> bool {
    if std::env::args_os().len() != 1 || crate::platform::is_installed() {
        return true;
    }
    let options = crate::platform::windows::get_silent_install_options(Some(false));
    match crate::platform::windows::install_me(options, String::new(), false, false) {
        Ok(()) if crate::platform::is_installed() => {}
        Ok(()) => crate::platform::message_box(
            "INCrovax-Support wurde nicht vollstaendig installiert. Bitte erneut starten und die Windows-Administratorabfrage bestaetigen.",
        ),
        Err(err) => crate::platform::message_box(&format!(
            "INCrovax-Support konnte nicht installiert werden: {err}",
        )),
    }
    false
}
