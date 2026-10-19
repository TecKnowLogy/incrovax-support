use hbb_common::config::{self, Config};

pub fn initialize() {
    *config::APP_NAME.write().unwrap() = "INCrovax Support".to_owned();
    for (key, value) in [
        ("custom-rendezvous-server", "support.incrovax.de"),
        ("relay-server", "support.incrovax.de:21117"),
        ("key", "1kVq4iLuQGqtAOcf2JwSx0uXPN7Q2qa8BUlK24lg7zo="),
        ("api-server", ""),
        ("approve-mode", "click"),
    ] {
        Config::set_option(key.to_owned(), value.to_owned());
    }
}
