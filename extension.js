 /*
  * Copyright (C) 2014, 2015, 2016, 2017, 2018 Tolga HOŞGÖR <tlghosgor@gmail.com>
  *
  * This program is free software; you can redistribute it and/or
  * modify it under the terms of the GNU General Public License
  * as published by the Free Software Foundation; either version 2
  * of the License, or (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program; if not, write to the Free Software
  * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
  */

const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Slider = imports.ui.slider;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Mainloop = imports.mainloop;

let aggregateMenu = Main.panel.statusArea.aggregateMenu;
let extension = null;

function getAudioIcon(percent) {
  let audioIcons = new Array('audio-volume-muted-symbolic', 'audio-volume-low-symbolic', 'audio-volume-medium-symbolic', 'audio-volume-high-symbolic');
  let iconIndex = (percent ? parseInt(percent / (100.1 / 3)) + 1 : 0);
  return audioIcons[iconIndex];
}

var Menu = class extends PopupMenu.PopupBaseMenuItem {
  constructor() {
    super({activate: false});

    this.icon = new St.Icon({style_class: 'popup-menu-icon'});
    this.slider = new Slider.Slider(0);

    this.actor.add(this.icon);
    this.actor.add(this.slider.actor, {expand: true});
  }
};

var Indicator = class extends PanelMenu.SystemIndicator {
  constructor() {
    super();

    this.iconIndicator = this._addIndicator();
  }
};

var Controller = class {
  constructor() {
    this._limitMax = 0;

    this._indicator = new Indicator();
    this._menu = new Menu();

    this._indicator.indicators.connect('scroll-event', this._onIndicatorScroll.bind(this));
    this._menu.slider.connect('notify::value', this._onSliderValueChanged.bind(this));

    this._timeoutId = Mainloop.timeout_add_seconds(1, this._amixerUpdate.bind(this));
    this._amixerUpdate();

    this._volumeVisibleId = aggregateMenu._volume.indicators.connect('notify::visible', this._syncMenuVisibility.bind(this));
    this._syncMenuVisibility(aggregateMenu._volume.indicators.visible);

    aggregateMenu._indicators.insert_child_above(this._indicator.indicators, aggregateMenu._volume.indicators);
    aggregateMenu.menu.addMenuItem(this._menu, 0);
  }

  destroy() {
    aggregateMenu._indicators.remove_child(this._indicator.indicators);

    this._menu.destroy();

    Mainloop.source_remove(this._timeoutId);

    aggregateMenu._volume.indicators.disconnect(this._volumeVisibleId);

    aggregateMenu._volume._volumeMenu.actor.show();
  }

  _onIndicatorScroll(indicator, e) {
    this._menu.slider.scroll(e);
  }

  _onSliderValueChanged() {
    let [success, pid] = GLib.spawn_async('/', ['/usr/bin/amixer', 'set', 'Master', '-M', '%d%%'.format(Math.round(this._menu.slider.value * 100))], ['LANGC=C'], GLib.SpawnFlags.STDOUT_TO_DEV_NULL, null);
    if (success) {
      this._updateIcons();
    }
  }

  _updateIcons() {
    let iconName = getAudioIcon(this._menu.slider.value * 100);

    this._menu.icon.icon_name = iconName;
    this._indicator.iconIndicator.icon_name = iconName;
  }

  _adjustVolume(diff) {
    this._menu.slider.value += diff / 100;
  }

  _readVolume(callback) {
    let [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(null, ['/usr/bin/amixer', 'get', 'Master', '-M'], ['LANG=C'], 0, null);
    GLib.close(stderr);
    GLib.close(stdin);
    this._amixerStdout = stdout;
  
    this._dataStdout = new Gio.DataInputStream({
      base_stream: new Gio.UnixInputStream({fd: stdout, close_fd: true})
    });
  
    //allocate enough buffer space
    this._dataStdout.set_buffer_size(512);
  
    let cb = this._amixerReadCb.bind(this, callback.bind(this));
    this._dataStdout.fill_async(-1, GLib.PRIORITY_DEFAULT, null, cb);
  }
  
  _amixerReadCb(callback, stream, result) {
    let cnt = this._dataStdout.fill_finish(result);
  
    if (cnt < 0) {
      return;
    } else if (cnt == 0) {
      this._dataStdout.close(null);
      return;
    }
  
    let data = this._dataStdout.peek_buffer();
  
    let re = /\[(\d{1,3})\%\]/m;
    let values = re.exec(data);
  
    if (values != null && !isNaN(values[1])) {
      if (this._limitMax == 0) {
        let re = /Limits: Playback 0 - (\d{1,4})/m;
        this._limitMax = re.exec(data)[1];
      }
  
      callback(values[1]);
      this._dataStdout.close(null);
      return;
    } else {
  	let cb = this._amixerReadCb.bind(this, callback);
      this._dataStdout.fill_async(-1, GLib.PRIORITY_DEFAULT, null, cb);
    }
  }
  
  _amixerUpdate() {
    this._readVolume(function(percent) {
      //set the value of the slider with 4% threshold margin
      let realValue = percent / 100;
      if (Math.abs(this._menu.slider.value - realValue) > 0.04) {
        if (typeof this._menu.slider.setValue === "function") {
          this._menu.slider.setValue(percent / 100);
        } else {
          this._menu.slider.value = percent / 100;
        }
      }

      this._updateIcons();
    }.bind(this));
  
    return true;
  }

  _syncMenuVisibility(defaultVolumeIndicator) {
    if (defaultVolumeIndicator.visible) {
      //hide our volume indicator
      this._indicator.indicators.hide();
      //hide our volume slider
      this._menu.actor.hide();
      //show default volume sliders
      aggregateMenu._volume._volumeMenu.actor.show();
    } else {
      //show our volume indicator
      this._indicator.indicators.show();
      //show our volume slider
      this._menu.actor.show();
      //hide default volume sliders
      aggregateMenu._volume._volumeMenu.actor.hide();
    }
  }
};

function init() {
}

function enable() {
  extension = new Controller();
}

function disable() {
  extension.destroy();
}
