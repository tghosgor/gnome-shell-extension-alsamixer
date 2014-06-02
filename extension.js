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

let statusMenu = Main.panel.statusArea.aggregateMenu;
let label, item, indicators, indicatorIcon = null, slider, menuIcon;

function getAudioIcon(percent) {
  let audioIcons = new Array('audio-volume-muted-symbolic', 'audio-volume-low-symbolic', 'audio-volume-medium-symbolic', 'audio-volume-high-symbolic');
  let iconIndex = (percent ? parseInt(percent / (101 / 3)) + 1 : 0);
  return audioIcons[iconIndex];
}

function onValueChanged() {
  let cmd = GLib.spawn_command_line_async('env LANG=C amixer set %s %d'.format("Master", parseInt(slider._getCurrentValue() * 64)));
  let iconName = getAudioIcon(slider._getCurrentValue() * 100);
  menuIcon.set_icon_name(iconName);
  indicatorIcon.set_icon_name(iconName);
}

//expensive because of GLib.spawn_command_line_sync
//only used on enable anyway
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
  let iconName = getAudioIcon(slider._getCurrentValue() * 100);
  menuIcon = new St.Icon({ icon_name: iconName,
    style_class: 'system-status-icon' });
  indicatorIcon = new St.Icon({ icon_name: iconName,
    style_class: 'system-status-icon' });
  
  //create the popup menu item
  item = new PopupMenu.PopupBaseMenuItem({ activate: false });
  item.actor.add(menuIcon);
  item.actor.add(slider.actor, { expand: true });
  
  //add to status menu
  statusMenu.menu.addMenuItem(item, 0);
  
  //add our icon to indicators
  statusMenu._indicators.insert_child_above(indicatorIcon, statusMenu._volume.indicators);
  
  //hide the volume mixer from menu if volume indicator is hidden
  if(!statusMenu._volume.indicators.visible)
    statusMenu._volume._volumeMenu.actor.hide();
  
  //check if the volume indicator is hidden and change volume mixer visibility
  statusMenu._volume.indicators.connect('notify::visible',
    function(a) {      
      if(!a.visible) {
        //hide default volume mixer
        statusMenu._volume._volumeMenu.actor.hide();
      } else {
        //show default volume mixer
        statusMenu._volume._volumeMenu.actor.show();
      }
    });
}

function disable() {
  statusMenu._indicators.remove_child(indicatorIcon);
  item.destroy();
  
  statusMenu._volume._volumeMenu.actor.show();
}
