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
const Slider = imports.ui.slider;
const GLib = imports.gi.GLib;

let menu = Main.panel.statusArea.aggregateMenu;
let label, item, slider, icon;

function getAudioIcon(percent) {
  let audioIcons = new Array('audio-volume-muted-symbolic', 'audio-volume-low-symbolic', 'audio-volume-medium-symbolic', 'audio-volume-high-symbolic');
  let iconIndex = (percent ? parseInt(percent / (101 / 3)) + 1 : 0);
  return audioIcons[iconIndex];
}

function onValueChanged() {
  let cmd = GLib.spawn_command_line_sync('env LANG=C amixer set %s %d'.format("Master", parseInt(slider._getCurrentValue() * 64)));
  icon.set_icon_name(getAudioIcon(slider._getCurrentValue() * 100));
}

function readVolume() {
  let cmd = GLib.spawn_command_line_sync('env LANG=C amixer get %s'.format("Master"));
  let re = /\[(\d{1,3})\%\]/m;
  let values = re.exec(cmd[1]);
  
  return values[1];
}

function init() {
}

function enable() {     
  //create the slider
  slider = new Slider.Slider(parseFloat(readVolume() / 100));
  slider.connect('value-changed', onValueChanged);
  
  //create the initial icons      
  icon = new St.Icon({ icon_name: getAudioIcon(slider._getCurrentValue() * 100),
    style_class: 'system-status-icon' });
  
  //create the popup menu item
  item = new PopupMenu.PopupBaseMenuItem({ activate: false });
  item.actor.add(icon);
  item.actor.add(slider.actor, { expand: true });
  
  //add to status menu
  menu.menu.addMenuItem(item, 0);
}

function disable() {
  item.destroy();
}
