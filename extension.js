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
let label, item, indicators, indicatorIcon = null, slider, menuIcon;
let amixerStdout, out_reader, dataStdout;

//returns audio icon name based on percent
function getAudioIcon(percent) {
  let audioIcons = new Array('audio-volume-muted-symbolic', 'audio-volume-low-symbolic', 'audio-volume-medium-symbolic', 'audio-volume-high-symbolic');
  let iconIndex = (percent ? parseInt(percent / (101 / 3)) + 1 : 0);
  return audioIcons[iconIndex];
}

//slider changed
function onValueChanged() {
  let cmd = GLib.spawn_command_line_async('env LANG=C amixer set %s %d'.format("Master", parseInt(slider._getCurrentValue() * 64)));
  let iconName = getAudioIcon(slider._getCurrentValue() * 100);
  menuIcon.set_icon_name(iconName);
  indicatorIcon.set_icon_name(iconName);
}

//expensive because of GLib.spawn_command_line_sync
//only used on enable anyway
function readVolume(callback) {
  let [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(null,
    ['/usr/bin/amixer', 'get', 'Master'], ['LANG=C'], 0, null);
  GLib.close(stderr);
  amixerStdout = stdout;
    
  dataStdout = new Gio.DataInputStream({
    base_stream: new Gio.UnixInputStream({fd: stdout, close_fd: true})
  });
  
  //allocate enough buffer space
  dataStdout.set_buffer_size(512);
  
  let readCallback = function(stream, result) {
    let cnt = dataStdout.fill_finish(result);

    if (cnt == 0) {
      dataStdout.close(null);
      return;
    }
    
    let data = dataStdout.peek_buffer();
  
    let re = /\[(\d{1,3})\%\]/m;
    let values = re.exec(data);
    
    callback(values[1]);
    
    dataStdout.close(null);
  };
  
  dataStdout.fill_async(-1, GLib.PRIORITY_DEFAULT, null, Lang.bind(this, readCallback));
}

function amixerUpdate() {
  readVolume(function(percent) {
    //set the value of the slider
    slider.setValue(parseFloat(percent / 100));
    //set icons
    let iconName = getAudioIcon(slider._getCurrentValue() * 100);
    indicatorIcon.set_icon_name(iconName);
    menuIcon.set_icon_name(iconName);
  
    Mainloop.timeout_add_seconds(1, amixerUpdate);
  });
}

function init() {
}

function enable() {     
  //create the slider
  slider = new Slider.Slider(0);
  slider.connect('value-changed', onValueChanged);
  
  //create the initial icons      
  let iconName = getAudioIcon(slider._getCurrentValue() * 100);
  menuIcon = new St.Icon({ icon_name: iconName,
    style_class: 'system-status-icon' });
  indicatorIcon = new St.Icon({ icon_name: iconName,
    style_class: 'system-status-icon' });
  
  //read volume async
  amixerUpdate();
  
  //create the popup menu item
  item = new PopupMenu.PopupBaseMenuItem({ activate: false });
  item.actor.add(menuIcon);
  item.actor.add(slider.actor, { expand: true });
  
  //add to status menu
  statusMenu.menu.addMenuItem(item, 0);
  
  //add our icon to indicators
  statusMenu._indicators.insert_child_above(indicatorIcon, statusMenu._volume.indicators);
  
  //if default volume indicator is visible
  if(statusMenu._volume.indicators.visible)
    indicatorIcon.hide(); //hide our indicator 
  else 
    statusMenu._volume._volumeMenu.actor.hide(); //else hide default volume sliders
  
  //on default volume indicator visibility change
  statusMenu._volume.indicators.connect('notify::visible',
    function(a) {
      //if is visible
      if(a.visible) {
        //hide our volume mixer
        indicatorIcon.hide();
        
        //show default volume sliders
        statusMenu._volume._volumeMenu.actor.show();
      } else {
        //show our volume mixer
        indicatorIcon.show();
        
        //hide default volume sliders
        statusMenu._volume._volumeMenu.actor.hide();
      }
    });
}

function disable() {
  //restore the default volume sliders
  statusMenu._volume._volumeMenu.actor.show();
  
  //remove our indicator
  statusMenu._indicators.remove_child(indicatorIcon);
  item.destroy();
}
