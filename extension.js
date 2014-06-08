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

let statusMenuId = Main.panel.statusArea.aggregateMenu;
let timeoutId, labelId, itemId, indicatorIconId = null, sliderId, menuIconId, volumeVisibleId;
let amixerStdoutId, outReaderId, dataStdoutId;

//returns audio icon name based on percent
function getAudioIcon(percent) {
  let audioIcons = new Array('audio-volume-muted-symbolic', 'audio-volume-low-symbolic', 'audio-volume-medium-symbolic', 'audio-volume-high-symbolic');
  let iconIndex = (percent ? parseInt(percent / (100.1 / 3)) + 1 : 0);
  return audioIcons[iconIndex];
}

//sliderId changed
function onValueChanged() {
  let [success, pid] = GLib.spawn_async('/', ['/usr/bin/amixer', 'set', 'Master', '%d'.format(parseInt(sliderId._getCurrentValue() * 64))], ['LANGC=C'], GLib.SpawnFlags.STDOUT_TO_DEV_NULL, null);
  if(success)
  {
    //prevent slider to move after set due to rounding error
    //expand to 64, then expand to 100 then normalize to 1
    let rounded = Math.round(parseInt(sliderId._getCurrentValue() * 64) * (100 / 64)) / 100;
    sliderId.setValue(rounded);
    //get appropriate icon name
    let iconName = getAudioIcon(sliderId._getCurrentValue() * 100);
    menuIconId.set_icon_name(iconName);
    indicatorIconId.set_icon_name(iconName);
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
    return;
  } else  
    dataStdoutId.fill_async(-1, GLib.PRIORITY_DEFAULT, null, callback);
}

function amixerUpdate() {
  readVolume(function(percent) {
    //set the value of the sliderId
    sliderId.setValue(parseFloat(percent / 100));
    //set icons
    let iconName = getAudioIcon(sliderId._getCurrentValue() * 100);
    indicatorIconId.set_icon_name(iconName);
    menuIconId.set_icon_name(iconName);
  
    timeoutId = Mainloop.timeout_add_seconds(1, amixerUpdate);
  });
}

function syncMenuVisibility(defaultVolumeIndicatorId) {
  if(defaultVolumeIndicatorId.visible) {
    //hide our volume indicator
    indicatorIconId.hide();
    //hide our volume slider
    itemId.actor.hide();
    //show default volume sliders
    statusMenuId._volume._volumeMenu.actor.show();
  } else {
    //show our volume indicator
    indicatorIconId.show();
    //show our volume slider
    itemId.actor.show();
    //hide default volume sliders
    statusMenuId._volume._volumeMenu.actor.hide();
  }
}

function init() {
}

function enable() {
  //create the sliderId
  sliderId = new Slider.Slider(0);
  sliderId.connect('value-changed', onValueChanged);
       
  let iconName = getAudioIcon(sliderId._getCurrentValue() * 100);
  //CREATE: menu icon
  menuIconId = new St.Icon({ icon_name: iconName,
    style_class: 'system-status-icon' });
  //CREATE: the indicator icon
  indicatorIconId = new St.Icon({ icon_name: iconName,
    style_class: 'system-status-icon' });
  
  //read volume async
  amixerUpdate();
  
  //CREATE: the popup menu item
  itemId = new PopupMenu.PopupBaseMenuItem({ activate: false });
  itemId.actor.add(menuIconId);
  itemId.actor.add(sliderId.actor, { expand: true });
  
  //add to status menu
  statusMenuId.menu.addMenuItem(itemId, 0);
  
  //add our icon to indicators
  statusMenuId._indicators.insert_child_above(indicatorIconId, statusMenuId._volume.indicators);
  
  //if default volume indicator is visible
  syncMenuVisibility(statusMenuId._volume.indicators.visible);
  
  //on default volume indicator visibility change
  volumeVisibleId = statusMenuId._volume.indicators.connect('notify::visible',
    function(a) {
      syncMenuVisibility(a);
    });
}

function disable() {
  Mainloop.source_remove(timeoutId);
  
  statusMenuId._volume.indicators.disconnect(volumeVisibleId);
  
  //restore the default volume sliders
  statusMenuId._volume._volumeMenu.actor.show();
  
  //RELEASE: the popup menu item
  itemId.destroy();
  
  //RELEASE: indicator icon
  indicatorIconId.destroy();
  //RELEASE: menu icon
  menuIconId.destroy();
}
