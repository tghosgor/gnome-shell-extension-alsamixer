/*
  * Copyright (C) 2014 Tolga HOŞGÖR <fasdfasdas@gmail.com>
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>.
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

let statusMenu = Main.panel.statusArea.aggregateMenu;
let label, menuItem, indicatorIcon = null, slider, menuIcon, volumeVisible;
let timeoutId, amixerStdoutId, outReaderId, dataStdoutId;

//returns audio icon name based on percent
function getAudioIcon(percent) {
  let audioIcons = new Array('audio-volume-muted-symbolic', 'audio-volume-low-symbolic', 'audio-volume-medium-symbolic', 'audio-volume-high-symbolic');
  let iconIndex = (percent ? parseInt(percent / (100.1 / 3)) + 1 : 0);
  return audioIcons[iconIndex];
}

//slider changed
function onValueChanged() {
  let [success, pid] = GLib.spawn_async('/', ['/usr/bin/amixer', 'set', 'Master', '%d'.format(parseInt(slider._getCurrentValue() * 64))], ['LANGC=C'], GLib.SpawnFlags.STDOUT_TO_DEV_NULL, null);
  if(success)
  {
    //prevent slider to move after set due to rounding error
    //expand to 64, then expand to 100 then normalize to 1
    let rounded = Math.round(parseInt(slider._getCurrentValue() * 64) * (100 / 64)) / 100;
    slider.setValue(rounded);
    //get appropriate icon name
    let iconName = getAudioIcon(slider._getCurrentValue() * 100);
    menuIcon.set_icon_name(iconName);
    indicatorIcon.set_icon_name(iconName);
  }
}

//expensive because of GLib.spawn_command_line_sync
//only used on enable anyway
function readVolume(callback) {
  let [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(null,
    ['/usr/bin/amixer', 'get', 'Master'], ['LANG=C'], 0, null);
  GLib.close(stderr);
  GLib.close(stdin);
  amixerStdoutId = stdout;
  
  dataStdoutId = new Gio.DataInputStream({
    base_stream: new Gio.UnixInputStream({fd: stdout, close_fd: true})
  });
  
  //allocate enough buffer space
  dataStdoutId.set_buffer_size(512);
  
  let cb = amixerReadCb.bind(this, callback);
  dataStdoutId.fill_async(-1, GLib.PRIORITY_DEFAULT, null, cb);
}

function amixerReadCb(callback, stream, result) {
  let cnt = dataStdoutId.fill_finish(result);

  if (cnt == 0) {
    dataStdoutId.close(null);
    return;
  }
    
  let data = dataStdoutId.peek_buffer();
  
  let re = /\[(\d{1,3})\%\]/m;
  let values = re.exec(data);
  
  if(values != null && !isNaN(values[1]))
  {
    callback(values[1]);
    dataStdoutId.close(null);
    return;
  } else {
	let cb = amixerReadCb.bind(this, callback);
    dataStdoutId.fill_async(-1, GLib.PRIORITY_DEFAULT, null, cb);
  }
}

function amixerUpdate() {
  readVolume(function(percent) {
    //set the value of the slider
    slider.setValue(parseFloat(percent / 100));
    //set icons
    let iconName = getAudioIcon(slider._getCurrentValue() * 100);
    indicatorIcon.set_icon_name(iconName);
    menuIcon.set_icon_name(iconName);
  });
  
  return true;
}

function syncMenuVisibility(defaultVolumeIndicatorId) {
  if(defaultVolumeIndicatorId.visible) {
    //hide our volume indicator
    indicatorIcon.hide();
    //hide our volume slider
    menuItem.actor.hide();
    //show default volume sliders
    statusMenu._volume._volumeMenu.actor.show();
  } else {
    //show our volume indicator
    indicatorIcon.show();
    //show our volume slider
    menuItem.actor.show();
    //hide default volume sliders
    statusMenu._volume._volumeMenu.actor.hide();
  }
}

function init() {
}

function enable() {
  //create the slider
  slider = new Slider.Slider(0);
  slider.connect('value-changed', onValueChanged);
       
  let iconName = getAudioIcon(slider._getCurrentValue() * 100);
  //CREATE: menu icon
  menuIcon = new St.Icon({ icon_name: iconName,
    style_class: 'system-status-icon' });
  //CREATE: the indicator icon
  indicatorIcon = new St.Icon({ icon_name: iconName,
    style_class: 'system-status-icon' });
  
  //read volume async
  amixerUpdate();
  //start amixer update interval
  timeoutId = Mainloop.timeout_add_seconds(1, amixerUpdate);
  
  //CREATE: the popup menu item
  menuItem = new PopupMenu.PopupBaseMenuItem({ activate: false });
  menuItem.actor.add(menuIcon);
  menuItem.actor.add(slider.actor, { expand: true });
  
  //add to status menu
  statusMenu.menu.addMenuItem(menuItem, 0);
  
  //add our icon to indicators
  statusMenu._indicators.insert_child_above(indicatorIcon, statusMenu._volume.indicators);
  
  //if default volume indicator is visible
  syncMenuVisibility(statusMenu._volume.indicators.visible);
  
  //on default volume indicator visibility change
  volumeVisible = statusMenu._volume.indicators.connect('notify::visible',
    function(a) {
      syncMenuVisibility(a);
    });
}

function disable() {
  Mainloop.source_remove(timeoutId);
  
  statusMenu._volume.indicators.disconnect(volumeVisible);
  
  //restore the default volume sliders
  statusMenu._volume._volumeMenu.actor.show();
  
  //RELEASE: the popup menu item
  menuItem.destroy();
  
  //RELEASE: indicator icon
  indicatorIcon.destroy();
  //RELEASE: menu icon
  menuIcon.destroy();
}
