const Applet = imports.ui.applet;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Interfaces = imports.misc.interfaces;
const Lang = imports.lang;
const Cinnamon = imports.gi.Cinnamon;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const PopupMenu = imports.ui.popupMenu;
const GLib = imports.gi.GLib;
const Gvc = imports.gi.Gvc;
const Pango = imports.gi.Pango;
const Tooltips = imports.ui.tooltips;
const Main = imports.ui.main;
const Settings = imports.ui.settings;

///@koutch Settings
const Gtk = imports.gi.Gtk;
const Util = imports.misc.util;
const Config = imports.misc.config; // To check cinnamon version to show/hide settings in context menu
///@koutch Settings

///@koutch 150% silder
function MyPopupSliderMenuItem() {
    this._init.apply(this, arguments);
}

MyPopupSliderMenuItem.prototype = {
    __proto__: PopupMenu.PopupSliderMenuItem.prototype,
    _init: function(value, parent, themeOption) {
    ///@koutch in_subMenu and themeOption are to fix right margin too short in PopupSubMenuMenuItem
    ///        seems to work with most of tested themes, there is a stylesheet.css if needed
        this.maxValue = 1;

        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, { activate: false });

        this.actor.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));

        if (isNaN(value))
            // Avoid spreading NaNs around
            throw TypeError('The slider value must be a number');
        this._value = Math.max(Math.min(value, this.maxValue), 0);

        this._slider = new St.DrawingArea({ style_class: themeOption + 'popup-slider-menu-item', reactive: true });
        this.addActor(this._slider, { span: -1, expand: true });
        this._slider.connect('repaint', Lang.bind(this, this._sliderRepaint));
        this.actor.connect('button-press-event', Lang.bind(this, this._startDragging)); /// _startDragging: function listen middle clic
        this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));

        this._releaseId = this._motionId = 0;
        this._dragging = false;

        this.parent = parent;

        this.playerSongLength = 0;


        this.SLIDER_VERTICAL_SCROLL_STEP = 0.05; /// scroll up & down
        if (this.parent == 'player') this.SLIDER_VERTICAL_SCROLL_STEP = 0.01; ///to scroll track with mouse wheel with a short interval
        this.SLIDER_HORIZONTAL_SCROLL_STEP = 0.01; /// scroll left & right

        this._width_multiplier = 2;
        if (this.parent == 'input') this._width_multiplier = 5;/// to fix right margin
        this.on_pause = false; /// to make a short pause when volume reach 100%
    },

    setMaxValue: function(value) {
        if (this.parent == 'player')  /// value is SongLength from player
            if(value > 0) this.SLIDER_VERTICAL_SCROLL_STEP = (1 / value);///to define scroll step to 1 secs
            else this.SLIDER_VERTICAL_SCROLL_STEP = 0;/// SongLength == 0 (e.g. radio streaming)
        else if (this.parent != 'player')
            this.maxValue = value;
    },

    setValue: function(value) {
        if (isNaN(value))
            throw TypeError('The slider value must be a number');

        this._value = Math.max(Math.min(value, this.maxValue), 0);

        this._slider.queue_repaint();
    },

    _pause: function(duration) {
        this.on_pause = true; /// to make a short pause when volume reach 100%
        if (this.on_pauseTimeoutId) {
            Mainloop.source_remove(this.on_pauseTimeoutId);
        }
        this.on_pauseTimeoutId = Mainloop.timeout_add(duration, Lang.bind(this, function() {
            this.on_pause = false;
        }));
    },

    _sliderRepaint: function(area) {
        let cr = area.get_context();
        let themeNode = area.get_theme_node();
        let [width, height] = area.get_surface_size();

        let handleRadius = themeNode.get_length('-slider-handle-radius');
        ///@koutch to fix right margin
//      let sliderWidth = width - 2 * handleRadius;
        let sliderWidth = width - this._width_multiplier * handleRadius;

        let sliderHeight = themeNode.get_length('-slider-height');

        let sliderBorderWidth = themeNode.get_length('-slider-border-width');

        let sliderBorderColor = themeNode.get_color('-slider-border-color');
        let sliderColor = themeNode.get_color('-slider-background-color');

        let sliderActiveBorderColor = themeNode.get_color('-slider-active-border-color');
        let sliderActiveColor = themeNode.get_color('-slider-active-background-color');

        cr.setSourceRGBA (
            sliderActiveColor.red / 255,
            sliderActiveColor.green / 255,
            sliderActiveColor.blue / 255,
            sliderActiveColor.alpha / 255);
        cr.rectangle(handleRadius, (height - sliderHeight) / 2, sliderWidth * this._value / this.maxValue, sliderHeight);
        cr.fillPreserve();
        cr.setSourceRGBA (
            sliderActiveBorderColor.red / 255,
            sliderActiveBorderColor.green / 255,
            sliderActiveBorderColor.blue / 255,
            sliderActiveBorderColor.alpha / 255);
        cr.setLineWidth(sliderBorderWidth);
        cr.stroke();

        cr.setSourceRGBA (
            sliderColor.red / 255,
            sliderColor.green / 255,
            sliderColor.blue / 255,
            sliderColor.alpha / 255);
        cr.rectangle(handleRadius + sliderWidth * this._value / this.maxValue, (height - sliderHeight) / 2, sliderWidth * (1 - this._value / this.maxValue), sliderHeight);
        cr.fillPreserve();
        cr.setSourceRGBA (
            sliderBorderColor.red / 255,
            sliderBorderColor.green / 255,
            sliderBorderColor.blue / 255,
            sliderBorderColor.alpha / 255);
        cr.setLineWidth(sliderBorderWidth);
        cr.stroke();

        let handleY = height / 2;
        let handleX = 0;
        let color = sliderActiveColor;

        ///@ Koutch add mark to locate 100% on the slider
        if ( this.maxValue > 1) { /// maxValue > 100%
            if ( this._value < 1 ) color = sliderColor;

            ///@koutch to fix right margin
//          handleX = handleRadius + (width - 2 * handleRadius) * 1/ this.maxValue;
            handleX = handleRadius + (width - this._width_multiplier * handleRadius) * 1/ this.maxValue;

            cr.setSourceRGBA (
                color.red / 255,
                color.green / 255,
                color.blue / 255,
                color.alpha / 255);
            /// draw dots under and over the slide bar "(handleY -/+ sliderHeight)"
            cr.arc(handleX, (handleY - sliderHeight), handleRadius/4 , 0, 2 * Math.PI);
            cr.fill();
            cr.arc(handleX, (handleY + sliderHeight), handleRadius/4 , 0, 2 * Math.PI);
            cr.fill();

        }

        ///@koutch to fix right margin
//      handleX = handleRadius + (width - 2 * handleRadius) * this._value / this.maxValue;
        handleX = handleRadius + (width - this._width_multiplier * handleRadius) * this._value / this.maxValue;

        color = themeNode.get_foreground_color();
        cr.setSourceRGBA (
            color.red / 255,
            color.green / 255,
            color.blue / 255,
            color.alpha / 255);
        cr.arc(handleX, handleY, handleRadius, 0, 2 * Math.PI);
        cr.fill();

    },

    _onScrollEvent: function (actor, event) {
        let direction = event.get_scroll_direction();

        if (this.on_pause) return; /// to make a short pause when volume reach 100%
        if (this.parent == 'player' ) this.emit('drag-begin'); /// to disable _updateTimer: function on scroll

        if (direction == Clutter.ScrollDirection.DOWN) {
            if (this.parent == 'player' )
                this._value = Math.max(0, this._value - this.SLIDER_VERTICAL_SCROLL_STEP);

            else if (this._value > 1){
                this._value = Math.max(1, this._value - this.SLIDER_VERTICAL_SCROLL_STEP);
                if (this._value < 1.01){///volume < 101%
                    this._value = 1;
                    this._pause(750);
                }
            }
            else
                this._value = Math.max(0, this._value - this.SLIDER_VERTICAL_SCROLL_STEP);
        }
        else if (direction == Clutter.ScrollDirection.UP) {
            if (this.parent == 'player' )
                this._value = Math.min(1, this._value + this.SLIDER_VERTICAL_SCROLL_STEP);

            else if (this._value < 0.99999){ /// volume < 100% (0,99999 to fix a bug with output volume ??)
                this._value = Math.min(1, this._value + this.SLIDER_VERTICAL_SCROLL_STEP);
                if (this._value >= 0.99999) { ///volume == 100%
                    this._value = 1;
                    this._pause(750);
                }
            }
            else
                this._value = Math.min(this.maxValue, this._value + this.SLIDER_VERTICAL_SCROLL_STEP);
        }
        else if (direction == Clutter.ScrollDirection.LEFT) {
            if (this.parent == 'player' ) return;
            if (this._value > 1)
                this._value = Math.max(1, this._value - this.SLIDER_HORIZONTAL_SCROLL_STEP);
            else
                this._value = Math.max(0, this._value - this.SLIDER_HORIZONTAL_SCROLL_STEP);
        }
        else if (direction == Clutter.ScrollDirection.RIGHT) {
            if (this.parent == 'player' ) return;
            if (this._value < 0.99999)
                this._value = Math.min(1, this._value + this.SLIDER_HORIZONTAL_SCROLL_STEP);
            else
                this._value = Math.min(this.maxValue, this._value + this.SLIDER_HORIZONTAL_SCROLL_STEP);
        }

        this._slider.queue_repaint();
        this.emit('value-changed', this._value);
        if (this.parent == 'player' ) this.emit('drag-end'); /// to allow scroll track
    },

    _moveHandle: function(absX, absY) {
        if (this.on_pause) return; /// to make a short pause when volume reach 100%
        let relX, relY, sliderX, sliderY;
        [sliderX, sliderY] = this._slider.get_transformed_position();
        relX = absX - sliderX;
        relY = absY - sliderY;

        let width = this._slider.width;
        let handleRadius = this._slider.get_theme_node().get_length('-slider-handle-radius');

        let newvalue;
        if (relX < handleRadius){
            if (this._value > 1)
                newvalue = 1; /// to make a step at 100%
            else
                newvalue = 0;
        }
        ///@koutch to fix right margin
//        else if (relX > width - handleRadius)
        else if (relX > width - ((this._width_multiplier / 2) * handleRadius)) {
            if (this._value < 0.99999) /// volume < 100% (0,99999 to fix a bug with output volume ??)
                newvalue = 1; /// to make a step at 100%
            else
                newvalue = this.maxValue;
        }
        else {
            ///@koutch to fix right margin
//            newvalue = (relX - handleRadius) / (width - 2 * handleRadius) * this.maxValue;
            newvalue = (relX - handleRadius) / (width - this._width_multiplier * handleRadius) * this.maxValue;
            if (newvalue > this.maxValue) { /// with 'width_multiplier = 5' a clic on the right close to the slider it reach more than this.maxValue
                if (this._value < 0.99999) /// volume < 100% (0,99999 to fix a bug with output volume ??)
                    newvalue = 1; /// to make a step at 100%
                else
                    newvalue = this.maxValue;
            }
        }
        ///@koutch to make that 100% seems magnetic
        if (newvalue > 0.98  && newvalue < 1.02 && this.value != 1 && this.maxValue > 1){
            newvalue = 1;
            if (this._dragging) this._pause(250);
        }

        if (this.parent == 'player') {
            if (this.SLIDER_VERTICAL_SCROLL_STEP == 0) /// SongLength == 0 keep slider at 0
                newvalue = 0;
            else if (newvalue >= 1)
                newvalue = newvalue - this.SLIDER_VERTICAL_SCROLL_STEP; /// 1 sec before the end of the track
        }

        this._value = newvalue;
        this._slider.queue_repaint();
        this.emit('value-changed', this._value);
    },

    _onKeyPressEvent: function (actor, event) {
        /// to make a short pause when volume reach 100%
        if (this.on_pause) return true; /// return true or else, for silder in submenu, Clutter.KEY_Left close the submenu

        let key = event.get_key_symbol();
        if (key == Clutter.KEY_Right || key == Clutter.KEY_Left) {
            let delta = 0;
            if (this.parent != 'player' )
                delta = key == Clutter.KEY_Right ? 0.1 : -0.1;
            else /// make a 10 secs step for player
                delta = key == Clutter.KEY_Right ? (10 * this.SLIDER_VERTICAL_SCROLL_STEP) : -(10 * this.SLIDER_VERTICAL_SCROLL_STEP);

            let newvalue = Math.max(0, Math.min(this._value + delta, this.maxValue));

            if (this.parent == 'player' && newvalue >= 1)
                newvalue = newvalue - this.SLIDER_VERTICAL_SCROLL_STEP; /// 1 sec before the end of the track

            if (this.parent != 'player' && this.maxValue > 1){
                if ((key == Clutter.KEY_Right && this._value < 1 && newvalue >= 1) || (key == Clutter.KEY_Left && this._value > 1  && newvalue <= 1 )){
                    ///@koutch to make that 100% seems magnetic
                    newvalue = 1;
                    this._pause(500);
                }
            }

            this._value = newvalue;
            this._slider.queue_repaint();
            this.emit('value-changed', this._value);
            this.emit('drag-end');
            return true;
        }
        return false;
    },

    _startDragging: function(actor, event) {
        if (event.get_button()==2) {///middle click
            this.emit('mute');
            this._dragging = false;
            return;
        }
        if (this._dragging) // don't allow two drags at the same time
            return;

        this.emit('drag-begin');
        this._dragging = true;

        // FIXME: we should only grab the specific device that originated
        // the event, but for some weird reason events are still delivered
        // outside the slider if using clutter_grab_pointer_for_device


        Clutter.grab_pointer(this._slider);
        this._releaseId = this._slider.connect('button-release-event', Lang.bind(this, this._endDragging));
        this._motionId = this._slider.connect('motion-event', Lang.bind(this, this._motionEvent));
        let absX, absY;
        [absX, absY] = event.get_coords();
        this._moveHandle(absX, absY);
    },
    getValue: function() {
        return this._value;
    }

};

const MEDIA_PLAYER_2_PATH = "/org/mpris/MediaPlayer2";
const MEDIA_PLAYER_2_NAME = "org.mpris.MediaPlayer2";
const MEDIA_PLAYER_2_PLAYER_NAME = "org.mpris.MediaPlayer2.Player";

/* global values */
let compatible_players = [
    'clementine', 'mpd', 'exaile', 'banshee', 'rhythmbox', 'rhythmbox3',
    'pragha', 'quodlibet', 'guayadeque', 'amarok', 'googlemusicframe', 'xbmc',
    'noise', 'xnoise', 'gmusicbrowser', 'spotify', 'audacious', 'vlc',
    'beatbox', 'songbird', 'pithos', 'gnome-mplayer', 'nuvolaplayer', 'qmmp',
    'deadbeef', 'smplayer', 'tomahawk', 'potamus', 'musique', 'bmp', 'atunes',
    'muine', 'xmms'];
let support_seek = [
    'clementine', 'banshee', 'rhythmbox', 'rhythmbox3', 'pragha', 'quodlibet',
    'amarok', 'xnoise', 'gmusicbrowser', 'spotify', 'vlc', 'gnome-mplayer',
    'qmmp', 'deadbeef', 'audacious'];
/* dummy vars for translation */
let x = _("Playing");
x = _("Paused");
x = _("Stopped");

const VOLUME_NOTIFY_ID = 1;
const VOLUME_ADJUSTMENT_STEP = 0.05; /* Volume adjustment step in % */

const ICON_SIZE = 28;

function TrackInfo() {
    this._init.apply(this, arguments);
}

TrackInfo.prototype = {
    _init: function(label, icon) {
        this.actor = new St.BoxLayout({style_class: 'sound-track-info'});
        this.label = new St.Label({text: label.toString()});
        this.icon = new St.Icon({icon_name: icon.toString()});
        this.actor.add_actor(this.icon);
        this.actor.add_actor(this.label);
    },
    getActor: function() {
        return this.actor;
    },
    setLabel: function(label) {
        this.label.text = label.toString();
    },
    getLabel: function() {
        return this.label.text.toString();
    },
    hide: function() {
        this.actor.hide();
    },
    show: function() {
        this.actor.show();
    },
};

function ControlButton() {
    this._init.apply(this, arguments);
}

ControlButton.prototype = {
    _init: function(icon, callback) {
        this.actor = new St.Bin({style_class: 'sound-button-container'});
        this.button = new St.Button({ style_class: 'sound-button' });
        this.button.connect('clicked', callback);
        this.icon = new St.Icon({
            icon_type: St.IconType.SYMBOLIC,
            icon_name: icon,
            icon_size: 16,
            style_class: 'sound-button-icon',
        });
        this.button.set_child(this.icon);
        this.actor.add_actor(this.button);
    },
    getActor: function() {
        return this.actor;
    },
    setIcon: function(icon) {
        this.icon.icon_name = icon;
    },

    enable: function() {
        this.button.remove_style_pseudo_class('disabled');
        this.button.can_focus = true;
        this.button.reactive = true;
    },

    disable: function() {
        this.button.add_style_pseudo_class('disabled');
        this.button.can_focus = false;
        this.button.reactive = false;
    }
}

function TextImageMenuItem() {
    this._init.apply(this, arguments);
}

TextImageMenuItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(text, icon, align, style) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this);

        this.actor = new St.BoxLayout({style_class: style});
        this.actor.add_style_pseudo_class('active');
        this.icon = new St.Icon({icon_name: icon, icon_type: St.IconType.SYMBOLIC, icon_size: 16});
        this.text = new St.Label({text: text});
        if (align === "left") {
            this.actor.add_actor(this.icon, { span: 0 });
            this.actor.add_actor(this.text, { span: -1 });
        }
        else {
            this.actor.add_actor(this.text, { span: 0 });
            this.actor.add_actor(this.icon, { span: -1 });
        }
    },

    setText: function(text) {
        this.text.text = text;
    },

    setIcon: function(icon) {
        this.icon.icon_name = icon;
    }
}

function Player() {
    this._init.apply(this, arguments);
}

///@koutch modify _showCover: function to fix issue if cover isn't squarish image
///        this._positionSlider use MyPopupSliderMenuItem
///        to make sliders keep same theme
///        add argument : themeOption to
///        this.seekControls use style_class: 'sound-seek-box'
///        this.sliderBin use style_class: 'sound-seek-slider'
///        modify _setMetadata: function to allow scrolling step to 1 secs
///
Player.prototype = {
    __proto__: PopupMenu.PopupMenuSection.prototype,

    _init: function(system_status_button, busname, owner, themeOption) {
        PopupMenu.PopupMenuSection.prototype._init.call(this);
        this.showPosition = true; // @todo: Get from settings
        this._owner = owner;
        this._busName = busname;
        this._system_status_button = system_status_button;
        this._name = this._busName.split('.')[3];

        ///@koutch
        this.themeOption = themeOption;

        Interfaces.getDBusProxyWithOwnerAsync(MEDIA_PLAYER_2_NAME,
                                              this._busName,
                                              Lang.bind(this, function(proxy, error) {
                                                  if (error) {
                                                      log(error);
                                                  } else {
                                                      this._mediaServer = proxy;
                                                      this._dbus_acquired();
                                                  }
                                              }));

        Interfaces.getDBusProxyWithOwnerAsync(MEDIA_PLAYER_2_PLAYER_NAME,
                                              this._busName,
                                              Lang.bind(this, function(proxy, error) {
                                                  if (error) {
                                                      log(error)
                                                  } else {
                                                      this._mediaServerPlayer = proxy;
                                                      this._dbus_acquired();
                                                  }
                                              }));

        Interfaces.getDBusPropertiesAsync(this._busName,
                                          MEDIA_PLAYER_2_PATH,
                                          Lang.bind(this, function(proxy, error) {
                                              if (error) {
                                                  log(error)
                                              } else {
                                                  this._prop = proxy;
                                                  this._dbus_acquired();
                                              }
                                          }));
    },
    ///@koutch
    _dbus_acquired: function() {
        if (!this._prop || !this._mediaServerPlayer || !this._mediaServer)
            return;

        this._playerInfo = new TextImageMenuItem(this._getName(), "media-playback-stop", "left", "popup-menu-item");
        this.addMenuItem(this._playerInfo);
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._trackCoverFile = this._trackCoverFileTmp = false;
        this._trackCover = new St.Bin({style_class: 'sound-track-cover', x_align: St.Align.START});
        this._trackCover.set_child(new St.Icon({icon_name: "media-optical-cd-audio", icon_size: 220, icon_type: St.IconType.FULLCOLOR}));
        this._trackInfosTop = new St.Bin({style_class: 'sound-track-infos', x_align: St.Align.START});
        this._trackInfosBottom = new St.Bin({style_class: 'sound-track-infos', x_align: St.Align.START});
        this._trackControls = new St.Bin({style_class: 'sound-playback-control', x_align: St.Align.MIDDLE});

        let mainBox = new St.BoxLayout({style_class: 'sound-track-box', vertical: true});
        mainBox.add_actor(this._trackInfosTop)
        mainBox.add_actor(this._trackCover);
        mainBox.add_actor(this._trackInfosBottom);

        this.addActor(mainBox);

        this.infos_top = new St.BoxLayout({vertical: true});
        this.infos_bottom = new St.BoxLayout({vertical: true});
        this._artist = new TrackInfo(_("Unknown Artist"), "system-users");
        this._album = new TrackInfo(_("Unknown Album"), "media-optical");
        this._title = new TrackInfo(_("Unknown Title"), "audio-x-generic");
        this._time = new TrackInfo("0:00 / 0:00", "document-open-recent");
        this.infos_top.add_actor(this._artist.getActor());
        this.infos_bottom.add_actor(this._album.getActor());
        this.infos_top.add_actor(this._title.getActor());

        this._trackInfosTop.set_child(this.infos_top);
        this._trackInfosBottom.set_child(this.infos_bottom);

        this._prevButton = new ControlButton('media-skip-backward',
            Lang.bind(this, function () { this._mediaServerPlayer.PreviousRemote(); }));
        this._prevButtonTooltip = new Tooltips.Tooltip(this._prevButton.button, _("Previous"));
        this._playButton = new ControlButton('media-playback-start',
            Lang.bind(this, function () { this._mediaServerPlayer.PlayPauseRemote(); }));
        this._playButtonTooltip = new Tooltips.Tooltip(this._playButton.button, _("Play"));
        this._stopButton = new ControlButton('media-playback-stop',
            Lang.bind(this, function () { this._mediaServerPlayer.StopRemote(); }));
        this._stopButtonTooltip = new Tooltips.Tooltip(this._stopButton.button, _("Stop"));
        this._nextButton = new ControlButton('media-skip-forward',
            Lang.bind(this, function () { this._mediaServerPlayer.NextRemote(); }));
        this._nextButtonTooltip = new Tooltips.Tooltip(this._nextButton.button, _("Next"));

        this.controls = new St.BoxLayout();
        this.controls.add_actor(this._prevButton.getActor());
        this.controls.add_actor(this._playButton.getActor());
        this.controls.add_actor(this._stopButton.getActor());
        this.controls.add_actor(this._nextButton.getActor());
        this._trackControls.set_child(this.controls);
        this.addActor(this._trackControls);

        this._seekControls = new St.Bin({style_class: 'sound-seek', x_align: St.Align.START});
        ///@koutch
        this.seekControls = new St.BoxLayout({style_class: this.themeOption + 'sound-seek-box'});
        this.seekControls.add_actor(this._time.getActor());

        ///@koutch  use MyPopupSliderMenuItem
        this._positionSlider = new MyPopupSliderMenuItem(0,'player', this.themeOption);
        this._positionSlider.connect('value-changed', Lang.bind(this, function(item) {
            let time = item._value * this._songLength;
            this._time.setLabel(this._formatTime(time) + " / " + this._formatTime(this._songLength));
        }));

        this._seeking = false;

        this._positionSlider.connect('drag-begin', Lang.bind(this, function(item) {
            this._seeking = true;
        }));
        this._positionSlider.connect('drag-end', Lang.bind(this, function(item) {
           this._seeking = false;
            let time = item._value * this._songLength;

            time = Math.round(time); ///@koutch ensure time is an integer usefull for scrolling

            this._time.setLabel(this._formatTime(time) + " / " + this._formatTime(this._songLength));
            this._wantedSeekValue = Math.round(time * 1000000);
            this._mediaServerPlayer.SetPositionRemote(this._trackObj, time * 1000000);
        }));

        ///@koutch
        this.sliderBin = new St.Bin({style_class: this.themeOption + 'sound-seek-slider'});
        this.sliderBin.set_child(this._positionSlider.actor);
        this.seekControls.add_actor(this.sliderBin);
        this._seekControls.set_child(this.seekControls);
        this.addActor(this._seekControls);

        if (this._mediaServer.CanRaise) {
            this._raiseButton = new ControlButton('go-up',
                Lang.bind(this, function () { this._mediaServer.RaiseRemote(); this._system_status_button.menu.actor.hide(); }));
            this._raiseButtonTooltip = new Tooltips.Tooltip(this._raiseButton.button, _("Open Player"));
            this.controls.add_actor(this._raiseButton.getActor());
        }

        if (this._mediaServer.CanQuit) {
            this._quitButton = new ControlButton('window-close',
                Lang.bind(this, function () { this._mediaServer.QuitRemote(); }));
            this.controls.add_actor(this._quitButton.getActor());
            this._quitButtonTooltip = new Tooltips.Tooltip(this._quitButton.button, _("Quit Player"));
        }

        /* this players don't support seek */
        // if (support_seek.indexOf(this._name) == -1) {
        if (!this._getCanSeek()) {
            this._time.hide();
            this.showPosition = false;
            this.sliderBin.hide();
        }

        this._timeoutId = 0;
        this._setStatus(this._mediaServerPlayer.PlaybackStatus)
        this._trackId = {};
        this._setMetadata(this._mediaServerPlayer.Metadata);
        this._currentTime = 0;
        this._timerTicker = 0;
        this._wantedSeekValue = 0;
        this._updatePositionSlider();

        this._mediaServerPlayerId = this._mediaServerPlayer.connectSignal('Seeked', Lang.bind(this, function(id, sender, value) {
            if (value > 0) {
                this._setPosition(value);
            }
            // Seek initiated by the position slider
            else if (this._wantedSeekValue > 0) {
                // Some broken gstreamer players (Banshee) reports always 0
                // when the track is seeked so we set the position at the
                // value we set on the slider
                this._setPosition(this._wantedSeekValue);
            }
            // Seek value send by the player
            else
                this._setPosition(value);

            this._wantedSeekValue = 0;
        }));

        this._propChangedId = this._prop.connectSignal('PropertiesChanged', Lang.bind(this, function(proxy, sender, [iface, props]) {
                if (props.PlaybackStatus)
                    this._setStatus(props.PlaybackStatus.unpack());
                if (props.Metadata)
                    this._setMetadata(props.Metadata.deep_unpack());
                if (props.CanGoNext || props.CanGoPrevious)
                    this._updateControls();
        }));

        this._getPosition();
    },

    _getName: function() {
        return this._name.charAt(0).toUpperCase() + this._name.slice(1);
    },


    _setName: function(status) {
        this._playerInfo.setText(this._getName() + " - " + _(status));
    },

    _updateControls: function() {
        this._prop.GetRemote(MEDIA_PLAYER_2_PLAYER_NAME, 'CanGoNext',
                             Lang.bind(this, function(value, err) {
                                let canGoNext = true;
                                if (!err)
                                    canGoNext = value[0].unpack();
                                if (canGoNext)
                                    this._nextButton.enable();
                                else
                                    this._nextButton.disable();
                                })
                            );

        this._prop.GetRemote(MEDIA_PLAYER_2_PLAYER_NAME, 'CanGoPrevious',
                             Lang.bind(this, function(value, err) {
                                let canGoPrevious = true;
                                if (!err)
                                    canGoPrevious = value[0].unpack();
                                if (canGoPrevious)
                                    this._prevButton.enable();
                                else
                                    this._prevButton.disable();
                                })
                            );
    },

    _updatePositionSlider: function(position) {
        this._canSeek = this._getCanSeek();

        if (this._songLength == 0 || position == false)
            this._canSeek = false

        // Clem: The following code was commented out. When the next song started, it resulted in hiding the sound menu, making it hard for the user to repeatedly click on the next song button.
        // There's probably a better fix and this was not tested with players which don't support seeking, but it fixes the regression created by the slider (apparently when the slider is hidden it closes the menu)
        // if (this._playerStatus == "Playing" && this._canSeek && this.showPosition)
        //     this._positionSlider.actor.show();
        // else
        //     this._positionSlider.actor.hide();
    },

    _setPosition: function(value) {
        if (value == null && this._playerStatus != 'Stopped') {
            this._updatePositionSlider(false);
        }
        else {
            this._currentTime = value / 1000000;
            this._updateTimer();
        }
    },

    _getPosition: function() {
        this._prop.GetRemote(MEDIA_PLAYER_2_PLAYER_NAME, 'Position', Lang.bind(this, function(position, ex) {
            if (!ex) {
                this._setPosition(position[0].get_int64());
            }
        }));
    },

    _getCanSeek: function() {
        let can_seek = true;
        this._prop.GetRemote(MEDIA_PLAYER_2_PLAYER_NAME, 'CanSeek', Lang.bind(this, function(position, ex) {
            if (!ex) {
                can_seek = position[0].get_boolean();
            }
        }));
        return can_seek;
    },
    ///@koutch
    _setMetadata: function(metadata) {
        if (!metadata)
            return;
        if (metadata["mpris:length"]) {
            this._stopTimer();
            if (this._playerStatus == "Playing")
                this._runTimer();
            // song length in secs
            this._songLength = metadata["mpris:length"].unpack() / 1000000;
        }
        else {
            this._songLength = 0;
            this._stopTimer();
        }

        ///@koutch to define scroll step to 1 secs
        this._positionSlider.setMaxValue(this._songLength);

        if (metadata["xesam:artist"]) {
            this._artist.setLabel(metadata["xesam:artist"].deep_unpack());
        }
        else
            this._artist.setLabel(_("Unknown Artist"));
        if (metadata["xesam:album"])
            this._album.setLabel(metadata["xesam:album"].unpack());
        else
            this._album.setLabel(_("Unknown Album"));
        if (metadata["xesam:title"])
            this._title.setLabel(metadata["xesam:title"].unpack());
        else
            this._title.setLabel(_("Unknown Title"));

        if (metadata["mpris:trackid"]) {
            this._trackObj = metadata["mpris:trackid"].unpack();
        }

        let change = false;
        if (metadata["mpris:artUrl"]) {
            if (this._trackCoverFile != metadata["mpris:artUrl"].unpack()) {
                this._trackCoverFile = metadata["mpris:artUrl"].unpack();

                if ( this._name === "spotify" )
                    this._trackCoverFile = this._trackCoverFile.replace("/thumb/", "/300/");

                change = true;
            }
        }
        else {
            if (this._trackCoverFile != false) {
                this._trackCoverFile = false;
                change = true;
            }
        }

        if (change) {
            if (this._trackCoverFile) {
                let cover_path = "";
                if (this._trackCoverFile.match(/^http/)) {
                    this._hideCover();
                    let cover = Gio.file_new_for_uri(decodeURIComponent(this._trackCoverFile));
                    this._trackCoverFileTmp = Gio.file_new_tmp('XXXXXX.mediaplayer-cover')[0];
                    cover.read_async(null, null, Lang.bind(this, this._onReadCover));
                }
                else {
                    cover_path = decodeURIComponent(this._trackCoverFile);
                    cover_path = cover_path.replace("file://", "");
                    this._showCover(cover_path);
                }
            }
            else
                this._showCover(false);
        }
        this._system_status_button.setAppletTextIcon(this, true);
    },

    _setStatus: function(status) {
        if (!status)
            return;
        this._updatePositionSlider();
        if (status == this._playerStatus)
            return;
        this._playerStatus = status;
        if (status == "Playing") {
            this._playButton.setIcon("media-playback-pause");
            this._playerInfo.setIcon("media-playback-start");
            this._system_status_button.setAppletTextIcon(this, true);
            this._runTimer();
        }
        else if (status == "Paused") {
            this._playButton.setIcon("media-playback-start");
            this._playerInfo.setIcon("media-playback-pause");
            this._system_status_button.setAppletTextIcon(this, false);
            this._pauseTimer();
        }
        else if (status == "Stopped") {
            this._playButton.setIcon("media-playback-start");
            this._playerInfo.setIcon("media-playback-stop");
            this._system_status_button.setAppletTextIcon(this, false);
            this._stopTimer();
        } else {
            this._system_status_button.setAppletTextIcon(this, false);
        }

        this._setName(status);
    },

    _updateTimer: function() {
        if (!this._seeking && this.showPosition && this._canSeek) {
            if (!isNaN(this._currentTime) && !isNaN(this._songLength) && this._currentTime > 0){
                this._positionSlider.setValue(this._currentTime / this._songLength);
            }
            else
                this._positionSlider.setValue(0);
        }

        if (!this._seeking)
            this._time.setLabel(this._formatTime(this._currentTime) + " / " + this._formatTime(this._songLength));
    },

    _runTimerCallback: function() {
        if (this._playerStatus == 'Playing') {
            if (this._timerTicker < 10) {
                this._currentTime += 1;
                this._timerTicker++;
                this._updateTimer();
            } else {
                this._getPosition();
                this._timerTicker = 0;
            }
            return true;
        }

        return false;
    },

    _runTimer: function() {
        if (this._timeoutId != 0) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }

        if (this._playerStatus == 'Playing') {
            this._getPosition()
            this._timerTicker = 0;
            this._timeoutId = Mainloop.timeout_add_seconds(1, Lang.bind(this, this._runTimerCallback));
        }
    },

    _pauseTimer: function() {
        if (this._timeoutId != 0) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._updateTimer();
    },

    _stopTimer: function() {
        this._currentTime = 0;
        this._pauseTimer();
        this._updateTimer();
    },

    _formatTime: function(s) {
        let ms = s * 1000;
        let msSecs = (1000);
        let msMins = (msSecs * 60);
        let msHours = (msMins * 60);
        let numHours = Math.floor(ms/msHours);
        let numMins = Math.floor((ms - (numHours * msHours)) / msMins);
        let numSecs = Math.floor((ms - (numHours * msHours) - (numMins * msMins))/ msSecs);
        if (numSecs < 10)
            numSecs = "0" + numSecs.toString();
        if (numMins < 10 && numHours > 0)
            numMins = "0" + numMins.toString();
        if (numHours > 0)
            numHours = numHours.toString() + ":";
        else
            numHours = "";
        return numHours + numMins.toString() + ":" + numSecs.toString();
    },

    _onReadCover: function(cover, result) {
        let inStream = cover.read_finish(result);
        let outStream = this._trackCoverFileTmp.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, null);
        outStream.splice_async(inStream, Gio.OutputStreamSpliceFlags.CLOSE_TARGET, 0, null, Lang.bind(this, this._onSavedCover));
    },

    _onSavedCover: function(outStream, result) {
        outStream.splice_finish(result, null);
        let cover_path = this._trackCoverFileTmp.get_path();
        this._showCover(cover_path);
    },

    _hideCover: function() {
        /*Tweener.addTween(this.trackCoverContainer, { opacity: 0,
            time: 0.3,
            transition: 'easeOutCubic',
        });*/
    },
    ///@koutch fix issue if cover isn't a squarish image
    _showCover: function(cover_path) {
        /*Tweener.addTween(this._trackCover, { opacity: 0,
            time: 0.3,
            transition: 'easeOutCubic',
            onComplete: Lang.bind(this, function() {*/
                if (! cover_path || ! GLib.file_test(cover_path, GLib.FileTest.EXISTS)) {
                    this._trackCover.set_child(new St.Icon({icon_name: "media-optical-cd-audio", icon_size: 210, icon_type: St.IconType.FULLCOLOR}));
                    cover_path = null;
                }
                else {
                    let l = new Clutter.BinLayout();
                    let b = new Clutter.Box();
                    ///@koutch fix issue if cover isn't a squarish image
                    ///        replace height by width : it don't works with height but it does with width ??
//                    let c = new Clutter.Texture({height: 210 * global.ui_scale, keep_aspect_ratio: true, filter_quality: 2, filename: cover_path});
                    let c = new Clutter.Texture({width: 210 * global.ui_scale, keep_aspect_ratio: true, filter_quality: 2, filename: cover_path});
                    ///@Koutch prevent too high cover for portait cover
                    if (c.get_height() > c.get_width()) {
                        let requested_size = 210 * global.ui_scale;
                        ///@koutch reduce width depending height to keep aspect ratio
                        c.set_width(requested_size * (requested_size/c.get_height()));
                        c.set_height(requested_size);
                    }

                    b.set_layout_manager(l);
                    b.set_width(230 * global.ui_scale);
                    b.add_actor(c);
                    this._trackCover.set_child(b);
                }
                this._system_status_button.setAppletTextIcon(this, cover_path);
                /*Tweener.addTween(this._trackCover, { opacity: 255,
                    time: 0.3,
                    transition: 'easeInCubic'
                });
            })
        });*/
    },

    setIcon: function(icon) {
       if (this._system_status_button._nbPlayers()==0)
         this._system_status_button.setIcon(icon);
       else
         this._system_status_button.setIcon('audio-x-generic');
    },

    destroy: function() {
        if (this._timeoutId != 0) {
            Mainloop.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        if (this._mediaServerPlayer)
            this._mediaServerPlayer.disconnectSignal(this._mediaServerPlayerId);
        if (this._prop)
            this._prop.disconnectSignal(this._propChangedId);
        PopupMenu.PopupMenuSection.prototype.destroy.call(this);
    }

}

function MediaPlayerLauncher(app, menu) {
    this._init(app, menu);
}

MediaPlayerLauncher.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (app, menu) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {});

        this._app = app;
        this._menu = menu;
        this.label = new St.Label({ text: app.get_name() });
        this.addActor(this.label);
        this._icon = app.create_icon_texture(ICON_SIZE);
        this.addActor(this._icon, { expand: false });
    },

    activate: function (event) {
        this._menu.actor.hide();
        this._app.activate_full(-1, event.get_time());
        return true;
    }

};

function MyApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}
///@koutch
MyApplet.prototype = {
    __proto__: Applet.TextIconApplet.prototype,
    ///@koutch
    _init: function(metadata, orientation, panel_height, instanceId) {
        Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height);

        try {
            this.metadata = metadata;
            this.settings = new Settings.AppletSettings(this, metadata.uuid, instanceId);
            this.settings.bindProperty(Settings.BindingDirection.IN, "showtrack", "showtrack", this.on_settings_changed, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "showalbum", "showalbum", this.on_settings_changed, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "truncatetext", "truncatetext", this.on_settings_changed, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "hideSystray", "hideSystray", function() {
                if (this.hideSystray) this.registerSystrayIcons();
                else this.unregisterSystrayIcons();
            });
            if (this.hideSystray) this.registerSystrayIcons();
            ///@koutch Settings
            this.settings.bindProperty(Settings.BindingDirection.IN, "show-player", "show_player", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "show-launch-player", "show_launch_player", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "show-launch-player-list", "show_launch_player_list", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "show-app", "show_app", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "show-app-list", "show_app_list", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "show-app-mutebutton", "show_app_mutebutton", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "show-output-device", "show_output_device", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "volume-max", "volume_max", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "mute-middle-click", "mute_middle_click", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "theme-option", "theme_option", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "show-custom-launcher", "show_custom_launcher", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "launch-icon", "launch_icon_name", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "launch-name", "launch_name", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "launch-command", "launch_command", this._applySettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "launch-in-terminal", "launch_in_terminal", this._applySettings, null);

            this.slider_volumeMax = 1;
            this.stop_scroll = false;/// to make a short pause when volume reach 100% while scrolling the applet
            this.launch_icon = new St.Icon();
            this.themeOption = ""; /// option to override the slider's theme

            ///@koutch add settings button in context menu
            // configuration via context menu is automatically provided in Cinnamon 2.0+
            let cinnamonVersion = Config.PACKAGE_VERSION.split('.')
            let majorVersion = parseInt(cinnamonVersion[0])

            // for Cinnamon 1.x, build a menu item
            if (majorVersion < 2) {
                this.edit_menu_item = new PopupMenu.PopupImageMenuItem(_('Settings'), "system-run-symbolic");
                this.edit_menu_item.connect('activate', Lang.bind(this, function () {
                    Util.spawnCommandLine('cinnamon-settings applets sound-with-apps-volume@koutch');
                }));
                this.edit_menu_item.addActor(new St.Button({ label: "   " }));/// to align icon with switch button
                this._applet_context_menu.addMenuItem(this.edit_menu_item);
            }
            ///@koutch Settings

            this.menuManager = new PopupMenu.PopupMenuManager(this);
            this.menu = new Applet.AppletPopupMenu(this, orientation);
            this.menuManager.addMenu(this.menu);

            this.set_applet_icon_symbolic_name('audio-x-generic');

            this._players = {};

/* TODO *********************
 *
 * While I don't think we can do away with our hardcoded player lists entirely,
 * the way the listener is implemented now allows for an unknown player, that supports
 * the mpris interfaces, can be discovered and controlled by the applet.
 *
 * It would be neat to be able to add these discovered players automatically to the
 * launchers list, so that next time, the program can be launched from the applet.
 *
 * org.mpris.MediaPlayer2.Identity can tell you the display name of the program.
 * org.mpris.MediaPlayer2.DesktopEntry can tell you the desktop file name (for the icon, etc..)
 *
 * So, when an unknown player is found, some pertinent information gets taken, and added
 * to an applet settings list.  At startup, supported_players and this list can be aggregated
 * to determine what launchers to add to the applet.
 *
 */

            Interfaces.getDBusAsync(Lang.bind(this, function (proxy, error) {
                this._dbus = proxy;

                // player DBus name pattern
                let name_regex = /^org\.mpris\.MediaPlayer2\./;
                // load players
                this._dbus.ListNamesRemote(Lang.bind(this,
                    function(names) {
                        for (let n in names[0]) {
                            let name = names[0][n];
                            if (name_regex.test(name)) {
                                this._dbus.GetNameOwnerRemote(name, Lang.bind(this,
                                    function(owner) {
                                        this._addPlayer(name, owner);
                                    }
                                ));
                            }
                        }
                    }
                ));

               // watch players
               this._ownerChangedId = this._dbus.connectSignal('NameOwnerChanged', Lang.bind(this,
                   function(proxy, sender, [name, old_owner, new_owner]) {
                       if (name_regex.test(name)) {
                           if (new_owner && !old_owner)
                               this._addPlayer(name, new_owner);
                           else if (old_owner && !new_owner && this._players[old_owner])
                               this._removePlayer(name, old_owner);
                           else
                               this._changePlayerOwner(name, old_owner, new_owner);
                       }
                   }
               ));
            }));

            this._control = new Gvc.MixerControl({ name: 'Cinnamon Volume Control' });
            this._control.connect('state-changed', Lang.bind(this, this._onControlStateChanged));
            this._control.connect('card-added', Lang.bind(this, this._onControlStateChanged));
            this._control.connect('card-removed', Lang.bind(this, this._onControlStateChanged));
            this._control.connect('default-sink-changed', Lang.bind(this, this._readOutput));
            this._control.connect('default-source-changed', Lang.bind(this, this._readInput));
            this._control.connect('stream-added', Lang.bind(this, this._maybeShowInput));
            this._control.connect('stream-removed', Lang.bind(this, this._maybeShowInput));
            this._volumeMax = 1*this._control.get_vol_max_norm(); // previously was 1.5*this._control.get_vol_max_norm();, but we'd need a little mark on the slider to make it obvious to the user we're going over 100%..

            this._output = null;
            this._outputVolumeId = 0;
            this._outputMutedId = 0;

            this._input = null;
            this._inputVolumeId = 0;
            this._inputMutedId = 0;

            this._icon_name = '';
            this._icon_path = null;
            this._iconTimeoutId = 0;

            this.actor.connect('scroll-event', Lang.bind(this, this._onScrollEvent));

            this.mute_out_switch = new PopupMenu.PopupSwitchMenuItem(_("Mute output"), false);
            this.mute_in_switch = new PopupMenu.PopupSwitchMenuItem(_("Mute input"), false);
            this._applet_context_menu.addMenuItem(this.mute_out_switch);
            this._applet_context_menu.addMenuItem(this.mute_in_switch);
            this.mute_out_switch.connect('toggled', Lang.bind(this, this._toggle_out_mute));
            this.mute_in_switch.connect('toggled', Lang.bind(this, this._toggle_in_mute));

            this._control.open();

            this._volumeControlShown = false;

            this._showFixedElements();

            ///@koucth Settings
            this._applySettings();

        }
        catch (e) {
            global.logError(e);
        }
    },

    on_settings_changed : function() {
        if (!this.showtrack) {
            this.setAppletText();
        }

        if (!this.showalbum) {
            this.setAppletIcon();
        }

        if (this.showtrack || this.showalbum) {
            for (let name in this._players) {
                this._addPlayer(null, name);
            }
        }
    },
    ///@koutch Settings
    _applySettings: function() {

        if (this.volume_max) this.slider_volumeMax = 1.5;
        else this.slider_volumeMax = 1;

        if (this.theme_option) this.themeOption = "My-";
        else this.themeOption = "";

        this._cleanup();
        this._volumeControlShown = false;
        this._showFixedElements();
        this._readOutput();
        this.setIconName(this._icon_name);

        /// refresh the menu if it has been open while applying settings
        if (this.menu.isOpen){
            this.menu.toggle();
            this.on_applet_clicked(null);
        }
    },
    ///@koutch
    on_applet_removed_from_panel : function() {

        ///@koucth Settings
        this.settings.finalize();    // This is called when a user removes the applet from the panel..

        if (this.hideSystray)
            this.unregisterSystrayIcons();
        if (this._iconTimeoutId) {
            Mainloop.source_remove(this._iconTimeoutId);
        }

        this._dbus.disconnectSignal(this._ownerChangedId);
    },
    ///@koutch
    on_applet_clicked: function(event) {
        if (!this.menu.isOpen){
            ///@koutch update application list
            this._appSubMenu();

            ///@koucth Settings
            if (this.show_launch_player_list && this.show_launch_player)
                this._launchPlayerItem.activate();

            if (this.show_app_list && this.show_app)
                this._selectAppItem.activate();
        }

        this.menu.toggle();
    },

    _toggle_out_mute: function() {
        if (this._output.is_muted) {
            this._output.change_is_muted(false);
            this.mute_out_switch.setToggleState(false);
        } else {
            this._output.change_is_muted(true);
            this.mute_out_switch.setToggleState(true);
        }
    },

    _toggle_in_mute: function() {
        if (this._input.is_muted) {
            this._input.change_is_muted(false);
            this.mute_in_switch.setToggleState(false);
        } else {
            this._input.change_is_muted(true);
            this.mute_in_switch.setToggleState(true);
        }
    },
    ///@koutch
    _onScrollEvent: function(actor, event) {
        let direction = event.get_scroll_direction();
        let currentVolume = this._output.volume;

        if (this.stop_scroll) return; /// to make a short pause when volume reach 100%

        if (direction == Clutter.ScrollDirection.DOWN) {
            let prev_muted = this._output.is_muted;
            if (this._output.volume > this._volumeMax){ /// volume > 100%
                this._output.volume = Math.max(this._volumeMax, currentVolume - this._volumeMax * VOLUME_ADJUSTMENT_STEP);
                if (this._output.volume <= this._volumeMax) { /// volume == 100%
                    this.stop_scroll = true; /// to make a short pause when volume reach 100%
                    if (this.stop_scrollTimeoutId) {
                        Mainloop.source_remove(this.stop_scrollTimeoutId);
                    }
                    this.stop_scrollTimeoutId = Mainloop.timeout_add(750, Lang.bind(this, function() {
                        this.stop_scroll = false;
                    }));
                }
            }
            else {
                this._output.volume = Math.max(0, currentVolume - this._volumeMax * VOLUME_ADJUSTMENT_STEP);
                if (this._output.volume < 1) {
                    this._output.volume = 0;
                    if (!prev_muted)
                        this._output.change_is_muted(true);
                }
            }

            this._output.push_volume();
        }
        else if (direction == Clutter.ScrollDirection.UP) {
            if (this._output.volume < this._volumeMax){ /// volume < 100%
                this._output.volume = Math.min(this._volumeMax, currentVolume + this._volumeMax * VOLUME_ADJUSTMENT_STEP);
                if (this._output.volume >= this._volumeMax) { /// volume == 100%
                    this.stop_scroll = true; /// to make a short pause when volume reach 100%
                    if (this.stop_scrollTimeoutId) {
                        Mainloop.source_remove(this.stop_scrollTimeoutId);
                    }
                    this.stop_scrollTimeoutId = Mainloop.timeout_add(750, Lang.bind(this, function() {
                        this.stop_scroll = false;
                    }));
                }
            }
            else
                this._output.volume = Math.min(this._volumeMax * this.slider_volumeMax, currentVolume + this._volumeMax * VOLUME_ADJUSTMENT_STEP);

            this._output.push_volume();
            this._output.change_is_muted(false);
        }

        this._notifyVolumeChange();
    },
    ///@Koutch
    _onButtonPressEvent: function (actor, event) {
        ///mute on middle click
        if (event.get_button() == 2 && this.mute_middle_click)
            this._toggle_out_mute();

        return Applet.Applet.prototype._onButtonPressEvent.call(this, actor, event);
    },
    ///@koutch
    setIconName: function(icon) {
        this._icon_name = icon;
        this.set_applet_icon_symbolic_name(icon);
        ///@koutch Settings test show_player settings to display volume icone if player is disable
        if (this._nbPlayers()>0 && this.show_player) {
            if (this._iconTimeoutId) {
                Mainloop.source_remove(this._iconTimeoutId);
                this._iconTimeoutId = 0;
            }
            this._iconTimeoutId = Mainloop.timeout_add(3000, Lang.bind(this, function() {
                if (this._nbPlayers() == 0)
                    return false;
                this._iconTimeoutId = 0;
                if (this['_output'].is_muted) {
                    this.set_applet_icon_symbolic_name('audio-volume-muted');
                } else if (this.showalbum) {
                    this.setAppletIcon(true, this._icon_path);
                } else {
                    this.set_applet_icon_symbolic_name('audio-x-generic');
                }
                return false;
            }));
        }
    },
    ///@koutch
    setAppletIcon: function(player, path) {
        if (path) {
            if (path === true) {
                // Restore the icon path from the saved path.
                path = this._icon_path;
            } else {
                this._icon_path = path;
            }
        } else if (path === null) {
            // This track has no art, erase the saved path.
            this._icon_path = null;
        }

        ///@koutch Settings test show_player settings to display volume icone if player is disable
        if (this.show_player) {
            if (this.showalbum) {
                if (path && player && (player === true || player._playerStatus == 'Playing')) {
                    this.set_applet_icon_path(path);
                } else {
                    this.setIconName('media-optical-cd-audio');
                }
            }
            else {
                this.set_applet_icon_symbolic_name('audio-x-generic');
            }
        }
    },
    ///@koutch
    setAppletText: function(player) {
        let title_text = "";
        ///@koutch Settings test show_player settings to display volume icone if player is disable
        if (this.showtrack && player && player._playerStatus == 'Playing' && this.show_player) {
            title_text = player._title.getLabel() + ' - ' + player._artist.getLabel();
            if (this.truncatetext < title_text.length) {
                title_text = title_text.substr(0, this.truncatetext) + "...";
            }
        }
        this.set_applet_label(title_text);
    },

    setAppletTextIcon: function(player, icon) {
        this.setAppletIcon(player, icon);
        this.setAppletText(player);
    },

    _nbPlayers: function() {
        let num = 0;
        for (let owner in this._players) {
            if (this._players[owner] != undefined)
                num++;
        }
        return num;
    },

    _removeOtherPlayers: function(newBusName) {
        if (this._nbPlayers() == 0)
            return;

        let num = 0;
        for (let owner in this._players) {
            if (this._players[owner]._busName != newBusName) {
                this._players[owner].destroy();
                delete this._players[owner];
            }
        }
    },

    _isInstance: function(busName) {
        // MPRIS instances are in the form
        //   org.mpris.MediaPlayer2.name.instanceXXXX
        // ...except for VLC, which to this day uses
        //   org.mpris.MediaPlayer2.name-XXXX
        return busName.split('.').length > 4 ||
                /^org\.mpris\.MediaPlayer2\.vlc-\d+$/.test(busName);
    },
    ///@koutch
    _addPlayer: function(busName, owner) {
        let position;
        if (this._players[owner]) {
            let prevName = this._players[owner]._busName;
            // HAVE: ADDING: ACTION:
            // master master reject, cannot happen
            // master instance upgrade to instance
            // instance master reject, duplicate
            // instance instance reject, cannot happen
            if (this._isInstance(busName) && !this._isInstance(prevName))
                this._players[owner]._busName = busName;
            else
                return;
        } else if (owner) {
            this._removeOtherPlayers(busName);
            this._cleanup()
            this._volumeControlShown = false;
            this._players[owner] = new Player(this, busName, owner, this.themeOption);
            this.menu.addMenuItem(this._players[owner]);
            this.menu.emit('players-loaded', true);
            this._showFixedElements();
            this.setIconName(this._icon_name);
            this._readOutput();
        }

        ///@koutch Settings refresh the menu : if player is launch when the menu is open
        ///        the menu stay open but don't display as it should
        if (this.menu.isOpen && this.show_player){
            this.menu.toggle();
            this.on_applet_clicked(null);
        }

    },
    ///@koutch
    _removePlayer: function(busName, owner) {
        if (this._players[owner]) {
            this._players[owner].destroy();
            delete this._players[owner];
            this._cleanup();
            this._volumeControlShown = false;
            this.menu.emit('players-loaded', true);
            this._showFixedElements();
            this._icon_path = null;
            this.setIconName(null);
            this._readOutput();
        }

        ///@koutch Settings refresh the menu : if player is closed by the "Quit Player" button in applet player
        ///        the menu stay open but don't display as it should
        if (this.menu.isOpen && this.show_player){
            this.menu.toggle();
            this.on_applet_clicked(null);
        }

    },

    _changePlayerOwner: function(busName, oldOwner, newOwner) {
        if (this._players[oldOwner] && busName == this._players[oldOwner]._busName) {
            this._players[newOwner] = this._players[oldOwner];
            this._players[newOwner].owner = newOwner;
            delete this._players[oldOwner];
            this._readOutput();
        }
    },

    _cleanup: function() {
        if (this._iconTimeoutId != 0) {
            Mainloop.source_remove(this._iconTimeoutId);
            this._iconTimeoutId = 0;
        }
        if (this._outputTitle) this._outputTitle.destroy();
        if (this._outputSlider) this._outputSlider.destroy();
        if (this._inputTitle) this._inputTitle.destroy();
        if (this._inputSlider) this._inputSlider.destroy();
        this._outputTitle = null;
        this._outputSlider = null;
        this._inputTitle = null;
        this._inputSlider = null;
        this.setAppletTextIcon();
        this.menu.removeAll();
     },
    ///@koutch
    _showFixedElements: function() {
        if (this._volumeControlShown) return;
        this._volumeControlShown = true;

        ///@koutch Settings test show_player settings to add 'Launch player'
        ///        if there is players but settings don't show it
        ///        show_launch_player is tested at the end of this function
        if (this._nbPlayers()==0 || !this.show_player ){
            if (this._nbPlayers()>0)
                this.menu.removeAll();/// ensure menu is empty

            this._availablePlayers = new Array();
            let appsys = Cinnamon.AppSystem.get_default();
            let allApps = appsys.get_all();
            let listedDesktopFiles = new Array();
            for (let y=0; y<allApps.length; y++) {
                let app = allApps[y];
                let entry = app.get_tree_entry();
                let path = entry.get_desktop_file_path();
                for (var p=0; p<compatible_players.length; p++) {
                    let desktopFile = compatible_players[p]+".desktop";
                    if (path.indexOf(desktopFile) != -1 && listedDesktopFiles.indexOf(desktopFile) == -1) {
                        this._availablePlayers.push(app);
                        listedDesktopFiles.push(desktopFile);
                    }
                }
            }

            if (this._availablePlayers.length > 0){
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                this._launchPlayerItem = new PopupMenu.PopupSubMenuMenuItem(_("Launch player..."), true);

                for (var p=0; p<this._availablePlayers.length; p++){
                    let playerApp = this._availablePlayers[p];
                    let menuItem = new MediaPlayerLauncher(playerApp, this._launchPlayerItem.menu);
                    this._launchPlayerItem.menu.addMenuItem(menuItem);
                }

                this.menu.addMenuItem(this._launchPlayerItem);
            }
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._outputTitle = new TextImageMenuItem(_("Volume"), "audio-volume-high", "right", "sound-volume-menu-item");

        ///@koutch MyPopupSlider
//        this._outputSlider = new PopupMenu.PopupSliderMenuItem(0);
        this._outputSlider = new MyPopupSliderMenuItem(0, 'volume', this.themeOption);
        this._outputSlider.setMaxValue (this.slider_volumeMax);
        this._outputSlider.connect('value-changed', Lang.bind(this, this._sliderChanged, '_output'));
        this._outputSlider.connect('drag-end', Lang.bind(this, this._notifyVolumeChange));
        this._outputSlider.actor.connect('scroll-event', Lang.bind(this, this._notifyVolumeChange));
        if (this.mute_middle_click)
            this._outputSlider.connect('mute', Lang.bind(this, this._toggle_out_mute));

        this.menu.addMenuItem(this._outputTitle);
        this.menu.addMenuItem(this._outputSlider);

        ///@koutch create applications submenu
        this._selectAppItem = new PopupMenu.PopupSubMenuMenuItem(_("  Applications..."));
        this.menu.addMenuItem(this._selectAppItem);
        this._appSubMenu();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._inputTitle = new PopupMenu.PopupMenuItem(_("Microphone"), { reactive: false });

        ///@koutch MyPopupSlider
//        this._inputSlider = new PopupMenu.PopupSliderMenuItem(0);
        this._inputSlider = new MyPopupSliderMenuItem(0, 'volume', this.themeOption);
        this._inputSlider.setMaxValue (this.slider_volumeMax);
        this._inputSlider.connect('value-changed', Lang.bind(this, this._sliderChanged, '_input'));
        this._inputSlider.connect('drag-end', Lang.bind(this, this._notifyVolumeChange));
        this._inputSlider.actor.connect('scroll-event', Lang.bind(this, this._notifyVolumeChange));

        this.menu.addMenuItem(this._inputTitle);
        this.menu.addMenuItem(this._inputSlider);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        ///@koutch show cusstom launcher
        if (this.show_custom_launcher){
            let launch_item = new PopupMenu.PopupMenuItem(this.launch_name);
            launch_item.connect('activate', Lang.bind(this, function() {
                    /// on click fonction
                    /**base on commandLauncher@scollins launch function**/
                    try {
                        let input = this.launch_command.replace("~/", GLib.get_home_dir() + "/"); //replace all ~/ with path to home directory
                        if (this.launch_in_terminal) {
                            input = 'gnome-terminal -e \'' + input + '\''
                        }
                        let [success, argv] = GLib.shell_parse_argv(input);

                        let flags = GLib.SpawnFlags.SEARCH_PATH;
                        GLib.spawn_async(null, argv, null, flags, null);

                    }
                    catch (e)  {
                        global.logError('Sound-with-apps-volume@koutch ; Failed to run launcher command ' + this.launch_command + ' : ' + e);
                    }
                 } ));

            try {/// @koutch --- try loading launch_icon ---
                let icon_open_file = Gio.File.new_for_path(this.launch_icon_name);
                if (icon_open_file.query_exists(null)) { /// this.launch_icon_name is a path
                    let gicon_launcher = new Gio.FileIcon({ file: Gio.file_new_for_path(this.launch_icon_name) });
                    let icon_launcher =  new St.Icon({ gicon: gicon_launcher, style_class: 'popup-menu-icon' });
                    this.launch_icon = icon_launcher;
                }
                else {
                    let icon_launcher = new St.Icon({ icon_name: this.launch_icon_name, style_class: 'popup-menu-icon' });
                    this.launch_icon = icon_launcher;
                }
            }
            catch (e)  {
                global.logError('Sound-with-apps-volume@koutch ; Failed to load custom launcher icon ' + this.launch_icon_name + ' : ' + e);
                let icon_launcher = new St.Icon({ icon_name: 'emblem-system-symbolic', style_class: 'popup-menu-icon' });
                this.launch_icon = icon_launcher;
            }

            launch_item.addActor(this.launch_icon, { align: St.Align.END, span: -1});
            this.menu.addMenuItem(launch_item);
        }

        this.menu.addSettingsAction(_("Sound Settings"), 'sound');

        this._selectDeviceItem = new PopupMenu.PopupSubMenuMenuItem(_("Output device..."), true);
        this.menu.addMenuItem(this._selectDeviceItem);

        if (this._showInput){
           this._inputTitle.actor.show();
           this._inputSlider.actor.show();
        }else{
           this._inputTitle.actor.hide();
           this._inputSlider.actor.hide();
        }

        this._volumeChanged (null, null, '_output');
        this._volumeChanged (null, null, '_input');

        ///@koutch Settings
        if (this.show_launch_player)
            this._launchPlayerItem.actor.show();
        else
            this._launchPlayerItem.actor.hide();

        if (this.show_app)
            this._selectAppItem.actor.show();
        else
            this._selectAppItem.actor.hide();

        if (this.show_output_device)
            this._selectDeviceItem.actor.show();
        else
            this._selectDeviceItem.actor.hide();
    },

    _sliderChanged: function(slider, value, property) {
        if (this[property] == null) {
            log ('Volume slider changed for %s, but %s does not exist'.format(property, property));
            return;
        }
        let volume = value * this._volumeMax;
        let muted;
        if (value < .01) {
            this[property].volume = 0;
            muted = true;
        } else {
            this[property].volume = volume;
            muted = false;
        }
        this[property].push_volume();
        if (this[property].is_muted !== muted)
            this[property].change_is_muted(muted);

    },

    _notifyVolumeChange: function() {
        Main.soundManager.play('volume');
    },
    ///@koutch
    _mutedChanged: function(object, param_spec, property) {
        let muted = this[property].is_muted;
        let slider = this[property+'Slider'];
        ///@koutch disable slider value change on mute
//        slider.setValue(muted ? 0 : (this[property].volume / this._volumeMax));
        if (property == '_output') {
            if (muted) {
                this.setIconName('audio-volume-muted');
                this._outputTitle.setIcon('audio-volume-muted');
                ///@koutch replace 0% by _("muted")
//                this.set_applet_tooltip(_("Volume") + ": 0%");
                this.set_applet_tooltip(_("Volume") + ": " + _("mute"));
//                this._outputTitle.setText(_("Volume") + ": 0%");
                this._outputTitle.setText(_("Volume") + ": " + _("mute"));
                this.mute_out_switch.setToggleState(true);
            } else {
                this.setIconName(this._volumeToIcon(this._output.volume));
                this._outputTitle.setIcon(this._volumeToIcon(this._output.volume));
                this.set_applet_tooltip(_("Volume") + ": " + Math.round(this._output.volume / this._volumeMax * 100) + "%");
                this._outputTitle.setText(_("Volume") + ": " + Math.round(this._output.volume / this._volumeMax * 100) + "%");
                this.mute_out_switch.setToggleState(false);
            }
        } else if (property == '_input') {
            if (muted) {
                this.mute_in_switch.setToggleState(true);
            } else {
                this.mute_in_switch.setToggleState(false);
            }
        }
    },
    ///@koutch
    _volumeChanged: function(object, param_spec, property) {
        if (this[property] == null) return;

        this[property+'Slider'].setValue(this[property].volume / this._volumeMax);
        if (property == '_output' && !this._output.is_muted) {
            this._outputTitle.setIcon(this._volumeToIcon(this._output.volume));
            this.setIconName(this._volumeToIcon(this._output.volume));
            this.set_applet_tooltip(_("Volume") + ": " + Math.round(this._output.volume / this._volumeMax * 100) + "%");
            this._outputTitle.setText(_("Volume") + ": " + Math.round(this._output.volume / this._volumeMax * 100) + "%");
        }
    },

    _volumeToIcon: function(volume) {
        if (volume < 1) {
            return 'audio-volume-muted';
        } else {
            let n = Math.floor(3 * volume / this._volumeMax) + 1;
            if (n < 2)
                return 'audio-volume-low';
            if (n >= 3)
                return 'audio-volume-high';
            return 'audio-volume-medium';
        }
    },

    _onControlStateChanged: function() {
        if (this._control.get_state() == Gvc.MixerControlState.READY) {
            this._readOutput();
            this._readInput();
            this.actor.show();
        } else {
            this.actor.hide();
        }
    },

    _readOutput: function() {
        if (this._outputVolumeId) {
            this._output.disconnect(this._outputVolumeId);
            this._output.disconnect(this._outputMutedId);
            this._outputVolumeId = 0;
            this._outputMutedId = 0;
        }
        this._output = this._control.get_default_sink();
        if (this._output) {
            this._outputMutedId = this._output.connect('notify::is-muted', Lang.bind(this, this._mutedChanged, '_output'));
            this._outputVolumeId = this._output.connect('notify::volume', Lang.bind(this, this._volumeChanged, '_output'));
            this._mutedChanged (null, null, '_output');
            this._volumeChanged (null, null, '_output');
            let sinks = this._control.get_sinks();
            this._selectDeviceItem.menu.removeAll();
            for (let i = 0; i < sinks.length; i++) {
                let sink = sinks[i];
                let menuItem = new PopupMenu.PopupMenuItem(sink.get_description());
                if (sinks[i].get_id() == this._output.get_id()) {
                    menuItem.setShowDot(true);
                }
                menuItem.connect('activate', Lang.bind(this, function() {
                    log('Changing default sink to ' + sink.get_description());
                    this._control.set_default_sink(sink);
                }));
                this._selectDeviceItem.menu.addMenuItem(menuItem);
            }
        } else {
            this._outputSlider.setValue(0);
            this.setIconName('audio-volume-muted-symbolic');
        }
    },

    _readInput: function() {
        if (this._inputVolumeId) {
            this._input.disconnect(this._inputVolumeId);
            this._input.disconnect(this._inputMutedId);
            this._inputVolumeId = 0;
            this._inputMutedId = 0;
        }
        this._input = this._control.get_default_source();
        if (this._input) {
            this._inputMutedId = this._input.connect('notify::is-muted', Lang.bind(this, this._mutedChanged, '_input'));
            this._inputVolumeId = this._input.connect('notify::volume', Lang.bind(this, this._volumeChanged, '_input'));
            this._mutedChanged (null, null, '_input');
            this._volumeChanged (null, null, '_input');
        } else {
            this._inputTitle.actor.hide();
            this._inputSlider.actor.hide();
        }
    },

    _maybeShowInput: function() {
        // only show input widgets if any application is recording audio
        this._showInput = false;
        let recordingApps = this._control.get_source_outputs();
        if (this._input && recordingApps) {
            for (let i = 0; i < recordingApps.length; i++) {
                let outputStream = recordingApps[i];
                let id = outputStream.get_application_id();
                // but skip gnome-volume-control and pavucontrol
                // (that appear as recording because they show the input level)
                if (!id || (id != 'org.gnome.VolumeControl' && id != 'org.PulseAudio.pavucontrol')) {
                    this._showInput = true;
                    break;
                }
            }
        }
        if (this._showInput) {
            this._inputTitle.actor.show();
            this._inputSlider.actor.show();
        } else {
            this._inputTitle.actor.hide();
            this._inputSlider.actor.hide();
        }
    },
///@koutch create application list
    _appSubMenu: function() {
        let sink_input_name_length = 20;
        let sink_input_name = "";
        let sink_inputs = this._control.get_sink_inputs();

        this._selectAppItem.menu.removeAll();
        this._selectAppItem.actor.hide(); /// hide application list if no application is playing sound

        if (!this.show_app)
            return;

        for (let i = 0; i < sink_inputs.length; i++) {
            this._selectAppItem.actor.show();

            let sink_input = sink_inputs[i];

            if (sink_input.get_name() == null) continue; /// fix abug with  "LADSPA Plugin Multiband EQ" & "PulseAudio Equalizer" who create an unnamed input report by @werewolfy

            if( sink_input.get_name().length < sink_input_name_length )     {
                sink_input_name = sink_input.get_name();
            }
            else {
                sink_input_name = sink_input.get_name().substring(0,sink_input_name_length) + '...' ;
            }

            let menuItem = new PopupMenu.PopupBaseMenuItem({reactive: false});
            menuItem._text = '- ' + sink_input_name + " : ";
            menuItem._percentage = Math.round( sink_input.volume / this._volumeMax * 100) + "%"
            if (sink_input.is_muted) menuItem._percentage =  _("mute");
            menuItem._text_percentage = new St.Label({text: menuItem._text + menuItem._percentage});
            menuItem.addActor(menuItem._text_percentage);
            ///@ koutch prevent python icon (e.g. exaile or decibel audio player)
            if (sink_input.get_icon_name()=='/usr/share/pixmaps/python2.7.xpm')
                menuItem._icon_name = sink_input.get_name().substring(0, sink_input.get_name().length - 3 );///to remove '.py'
            else
                menuItem._icon_name = sink_input.get_icon_name();

            menuItem._icon = new St.Icon({ icon_name: menuItem._icon_name, icon_type: St.IconType.FULLCOLOR, style_class: 'popup-menu-icon' });
            menuItem.addActor(menuItem._icon);
            ///@koutch add mute button
            if (this.show_app_mutebutton){
                ///I use "icon_file" because I can't find a better icon than 'audio-volume-muted-blocked-panel' in this way
                let icon_file = Gio.File.new_for_path('/usr/share/icons/gnome/scalable/status/audio-volume-muted-symbolic.svg');
                if (icon_file.query_exists(null)) {/// icon is found
                    let gicon = new Gio.FileIcon({ file: Gio.file_new_for_path('/usr/share/icons/gnome/scalable/status/audio-volume-muted-symbolic.svg') });
                    menuItem._muteIcon = new St.Icon({ gicon: gicon, style_class: 'popup-menu-icon' });
                }
                else {
                    menuItem._muteIcon = new St.Icon({icon_name:'audio-volume-muted-blocked-panel', icon_type: St.IconType.FULLCOLOR, icon_size: 16});
                }
                menuItem._muteButton = new St.Button({ child: menuItem._muteIcon});
                menuItem._muteButton.connect('clicked', Lang.bind(this, function(){
                   if (!sink_input.is_muted){
                        sink_input.change_is_muted(true);
                        menuItem._percentage =  _("mute");
                    }
                    if (sink_input.is_muted){
                        sink_input.change_is_muted(false);
                        menuItem._percentage = Math.round( sink_input.volume / this._volumeMax * 100) + "%"
                     }
                    ///@koutch update menuItem percentage
                    menuItem.removeActor(menuItem._text_percentage);
                    menuItem.removeActor(menuItem._icon);
                    if (this.show_app_mutebutton)
                        menuItem.removeActor(menuItem._muteButton);
                    menuItem._text_percentage = new St.Label({text: menuItem._text + menuItem._percentage});
                    menuItem.addActor(menuItem._text_percentage);
                    menuItem.addActor(menuItem._icon);
                    if (this.show_app_mutebutton)
                        menuItem.addActor(menuItem._muteButton);
                }));
                menuItem.addActor(menuItem._muteButton);
            }

            let sink_inputSlider = new MyPopupSliderMenuItem(sink_input.volume / this._volumeMax, 'input', this.themeOption);
            sink_inputSlider.setMaxValue (this.slider_volumeMax);
            sink_inputSlider.setValue (sink_input.volume / this._volumeMax);
            sink_inputSlider.connect('value-changed', Lang.bind(this, function(slider, value ) {
                let volume = value * this._volumeMax;
                let prev_muted = sink_input.is_muted;

                if (volume < 1) {
                    sink_input.volume = 0;
                    if (!prev_muted)
                        sink_input.change_is_muted(true);
                    menuItem._percentage =  _("mute");
                }
                else {
                    sink_input.volume = volume;
                    if (prev_muted)
                        sink_input.change_is_muted(false);
                    menuItem._percentage = Math.round( sink_input.volume / this._volumeMax * 100) + "%"
                }

                sink_input.push_volume();

                ///@koutch update menuItem percentage
                menuItem.removeActor(menuItem._text_percentage);
                menuItem.removeActor(menuItem._icon);
                if (this.show_app_mutebutton)
                    menuItem.removeActor(menuItem._muteButton);
                menuItem._text_percentage = new St.Label({text: menuItem._text + menuItem._percentage});
                menuItem.addActor(menuItem._text_percentage);
                menuItem.addActor(menuItem._icon);
                if (this.show_app_mutebutton)
                    menuItem.addActor(menuItem._muteButton);
            }));

            if (this.mute_middle_click){
                sink_inputSlider.connect('mute', Lang.bind(this, function(slider) {
                   if (!sink_input.is_muted){
                        sink_input.change_is_muted(true);
                        menuItem._percentage =  _("mute");
                    }
                    if (sink_input.is_muted){
                        sink_input.change_is_muted(false);
                        menuItem._percentage = Math.round( sink_input.volume / this._volumeMax * 100) + "%"
                     }
                    ///@koutch update menuItem percentage
                    menuItem.removeActor(menuItem._text_percentage);
                    menuItem.removeActor(menuItem._icon);
                    if (this.show_app_mutebutton)
                        menuItem.removeActor(menuItem._muteButton);
                    menuItem._text_percentage = new St.Label({text: menuItem._text + menuItem._percentage});
                    menuItem.addActor(menuItem._text_percentage);
                    menuItem.addActor(menuItem._icon);
                    if (this.show_app_mutebutton)
                        menuItem.addActor(menuItem._muteButton);
                }));
            }
            this._selectAppItem.menu.addMenuItem(menuItem);
            this._selectAppItem.menu.addMenuItem(sink_inputSlider);
        }
    },

    registerSystrayIcons: function() {
        for (let i = 0; i < support_seek.length; i++) {
            Main.systrayManager.registerRole(support_seek[i], this.metadata.uuid);
        }
    },

    unregisterSystrayIcons: function() {
        Main.systrayManager.unregisterId(this.metadata.uuid);
    }
};

function main(metadata, orientation, panel_height, instanceId) {
    let myApplet = new MyApplet(metadata, orientation, panel_height, instanceId);
    return myApplet;
}
