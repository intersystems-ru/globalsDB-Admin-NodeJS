/**
 * Geometry functions simplifier.
 *
 * @type {{normalizeAngle: Function, angleDifference: Function}}
 */
var Geometry = {

    normalizeAngle: function(angle) {
        return (angle + Math.PI*2) % (2*Math.PI);
    },

    angleDifference: function(sourceAngle, destinationAngle) {
        return this.normalizeAngle(destinationAngle - sourceAngle);
    }

};

var blockEvent = function(e) {
    e.preventDefault();
    e.cancelBubble = true;
    if (e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
    }
};

var app = new function() {

    var DOM_ELEMENTS = {
            VIEWPORT: null,
            FIELD: null
        },
        USE_HARDWARE_ACCELERATION = false,
        DATA_ADAPTER = dataAdapter,
        TREE_ROOT = null,
        manipulator,

        ACTION_HANDLERS_ON = true,

        CSS_CLASSNAME_NODE = "node",
        CSS_CLASSNAME_LINK = "link",

        CSS_CLASSNAME_SELECT = "selected",
        CSS_CLASSNAME_DELETE = "deleting",
        CSS_CLASSNAME_EDIT = "editing",
        CSS_EMPTY_CLASSNAME = "",

        NODE_STATE_ACTION_SELECT = 0,
        NODE_STATE_ACTION_EDIT = 1,
        NODE_STATE_ACTION_DELETE = 2,
        NODE_STATE_ACTIONS = 3,

        MIN_NODES_DISTANCE = 110, // minimal distance between nodes
        BASE_NODE_RADIUS = 140,
        TREE_NODE_RADIUS = 80,

        TRIGGER_ADD = 0,
        TRIGGER_JUMP = 1;

    var setElements = function() {

        DOM_ELEMENTS.VIEWPORT = document.getElementById("fieldViewport");
        DOM_ELEMENTS.FIELD = document.getElementById("field");

    };

    var transformsSupport = function() {

        var el = document.createElement('p'),
            has3d,
            transforms = {
                'webkitTransform':'-webkit-transform',
                'OTransform':'-o-transform',
                'msTransform':'-ms-transform',
                'MozTransform':'-moz-transform',
                'transform':'transform'
            };

        document.body.insertBefore(el, null);

        for(var t in transforms){
            if (!transforms.hasOwnProperty(t)) continue;
            if( el.style[t] !== undefined ){
                el.style[t] = 'translate3d(1px,1px,1px)';
                has3d = window.getComputedStyle(el, null).getPropertyValue(transforms[t]);
            }
        }

        document.body.removeChild(el);

        return (has3d !== undefined && has3d.length > 0 && has3d !== "none");

    };

    /**
     * Handles all user events and adapts them to the controller. Also manipulates viewport.
     */
    var Manipulator = function() {

        var _this = this,
            VIEWPORT_WIDTH = window.innerWidth,
            VIEWPORT_HEIGHT = window.innerHeight,
            VIEW_X = 0,
            VIEW_Y = 0,
            VISUAL_VIEW_X = 0,
            VISUAL_VIEW_Y = 0,
            VIEWPORT_SCALE = 1,
            WORLD_WIDTH = 100000,
            WORLD_HEIGHT = 100000,
            MIN_SCALE = 0.3,
            MAX_SCALE = 3,
            viewportUpdateInterval = 0,
            touchObject = {
                ox: 0,
                oy: 0,
                x: 0,
                y: 0,
                target: null,
                event: null,
                pressed: false
            };

        this.getRelativeCenter = function() {

            return {
                x: WORLD_WIDTH/2,
                y: WORLD_HEIGHT/2
            }

        };

        this.getViewX = function() { return VIEW_X - WORLD_WIDTH/2; };
        this.getViewY = function() { return VIEW_Y - WORLD_HEIGHT/2; };

        /**
         * Performs relative scale for viewport.
         */
        this.scaleView = function(delta) {

            var element = DOM_ELEMENTS.FIELD;

            VIEWPORT_SCALE += delta;

            VIEWPORT_SCALE = Math.max(MIN_SCALE, Math.min(MAX_SCALE, VIEWPORT_SCALE));

            element.style["transform"] = element.style["-ms-transform"] = element.style["-o-transform"] =
                element.style["-moz-transform"] = element.style["-webkit-transform"] =
                    "scale(" + VIEWPORT_SCALE + ")";

        };

        /**
         * Centers the viewport on a (x, y) coordinates.
         *
         * @param x
         * @param y
         */
        this.setViewCenter = function(x, y) {

            VIEW_X = WORLD_WIDTH/2 + x - VIEWPORT_WIDTH/2;
            VIEW_Y = WORLD_HEIGHT/2 + y - VIEWPORT_HEIGHT/2;
            if (!viewportUpdateInterval) viewportUpdateInterval = setInterval(viewportUpdater, 25);

        };

        var viewportUpdater = function() {

            var deltaX, deltaY;

            VISUAL_VIEW_X += deltaX = (VIEW_X - VISUAL_VIEW_X)/2;
            VISUAL_VIEW_Y += deltaY = (VIEW_Y - VISUAL_VIEW_Y)/2;

            if (Math.abs(deltaX) + Math.abs(deltaY) < 0.001) {
                clearInterval(viewportUpdateInterval);
                viewportUpdateInterval = 0;
                VISUAL_VIEW_X = VIEW_X;
                VISUAL_VIEW_Y = VIEW_Y;
            }

            DOM_ELEMENTS.VIEWPORT.scrollLeft = Math.round(VISUAL_VIEW_X);
            DOM_ELEMENTS.VIEWPORT.scrollTop = Math.round(VISUAL_VIEW_Y);

        };

        var pointerEvents = new function() {

            this.started = function(e) {

                e.ox = e.x;
                e.oy = e.y;
                e.i = 0;
                e.ld = undefined;
                e.ovx = _this.getViewX() + VIEWPORT_WIDTH/2;
                e.ovy = _this.getViewY() + VIEWPORT_HEIGHT/2;

            };

            this.moved = function(e) { // limited while pressed

                // @todo: fix immediate double-touch zoom issue

                if (!e.event.changedTouches || e.event.changedTouches.length < 2) {
                    blockEvent(e.event);
                } else {
                    var d = Math.sqrt(Math.pow(e.event.changedTouches[0].pageX - e.event.changedTouches[1].pageX, 2) +
                        Math.pow(e.event.changedTouches[0].pageY - e.event.changedTouches[1].pageY, 2));
                    if (e.ld) {
                        e.i++;
                        _this.scaleView((d - e.ld)/100);
                    }
                    e.ld = d;
                }
                _this.setViewCenter(e.ovx + (e.ox - e.x), e.ovy + (e.oy - e.y));

            };

            this.ended = function(e) {

                //alert(e.i);
                //console.log("scroll end");

            };

        };

        var keyboardEvents = new function() {

            var keyStat = {},
                KEY_PRESSED = 1,
                KEY_RELEASED = 0;

            this.keyPress = function(keyCode, event) {

                keyStat[keyCode] = KEY_PRESSED;

                var scrolling = function(delta) {

                    if (TREE_ROOT) TREE_ROOT.scrollEvent(delta);

                };

                switch (keyCode) {
                    case 8: { // BACKSPACE
                        if (TREE_ROOT) TREE_ROOT.backEvent();
                        blockEvent(event);
                    } break;
                    case 13: { // ENTER
                        if (TREE_ROOT) TREE_ROOT.triggerEvent();
                    } break;
                    case 37: { // LEFT
                        if (TREE_ROOT) TREE_ROOT.changeStateAction(-1);
                    } break;
                    case 38: { // UP
                        scrolling(-1);
                    } break;
                    case 39: { // RIGHT
                        if (TREE_ROOT) TREE_ROOT.changeStateAction(1);
                    } break;
                    case 40: { // DOWN
                        scrolling(1);
                    } break;
                }

            };

            this.keyRelease = function(keyCode, event) {
                keyStat[keyCode] = KEY_RELEASED;
            };

        };

        /**
         * Handles viewport update.
         */
        this.viewportUpdated = function() {

            VIEWPORT_WIDTH = window.innerWidth;
            VIEWPORT_HEIGHT = window.innerHeight;

        };

        /**
         * Returns viewport to original position.
         */
        this.resetViewport = function() {

            DOM_ELEMENTS.FIELD.style.width = WORLD_WIDTH + "px";
            DOM_ELEMENTS.FIELD.style.height = WORLD_HEIGHT + "px";
            _this.setViewCenter(0, 0);
            VISUAL_VIEW_X = VIEW_X;
            VISUAL_VIEW_Y = VIEW_Y;

        };

        this.initialize = function() {

            manipulator.viewportUpdated();
            _this.resetViewport();

            var setupTouchEvent = function(event) {
                var t = (event.touches || event.changedTouches || [event])[0];
                if (!t) return;
                touchObject.x = t.pageX;
                touchObject.y = t.pageY;
                touchObject.event = event;
                touchObject.target = event.target || event.srcElement;
            };

            DOM_ELEMENTS.VIEWPORT.ontouchstart = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                touchObject.pressed = true;
                setupTouchEvent(e);
                pointerEvents.started(touchObject);
            };
            DOM_ELEMENTS.VIEWPORT.ontouchmove = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                setupTouchEvent(e);
                pointerEvents.moved(touchObject);
            };
            DOM_ELEMENTS.VIEWPORT.ontouchend = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                touchObject.pressed = false;
                setupTouchEvent(e);
                pointerEvents.ended(touchObject);
            };
            DOM_ELEMENTS.VIEWPORT.onmousedown = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                touchObject.pressed = true;
                setupTouchEvent(e);
                pointerEvents.started(touchObject);
            };
            DOM_ELEMENTS.VIEWPORT.onmousemove = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                if (!touchObject.pressed) return;
                setupTouchEvent(e);
                pointerEvents.moved(touchObject);
            };
            DOM_ELEMENTS.VIEWPORT.onmouseup = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                touchObject.pressed = false;
                setupTouchEvent(e);
                pointerEvents.ended(touchObject);
            };
            DOM_ELEMENTS.VIEWPORT.onmousewheel = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                _this.scaleView(-(e.deltaY || e.wheelDelta)/2000);
            };
            document.body.onkeydown = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                keyboardEvents.keyPress(e.keyCode, e);
            };
            document.body.onkeyup = function(e) {
                if (!ACTION_HANDLERS_ON) return;
                keyboardEvents.keyRelease(e.keyCode, e);
            };

        };

    };

    /**
     * Node element.
     *
     * @param parentNode {Node} Parent node
     * @param initialIndex {Array} Node index. In case of string, node will try require data in data adapter with it's path.
     *  In case of object, node will get new properties.
     * @param baseAngle
     * [ @param startX ]
     * [ @param startY ]
     * @constructor
     */
    var Node = function(parentNode, initialIndex, baseAngle, startX, startY) {

        var _this = this,
            PARENT_NODE = (parentNode instanceof Node)?parentNode:null,
            CHILD_NODES = [],
            INDEX = "",
            visualNodeProps = {
                x: 0,
                y: 0,
                r: 0,
                relativeX: manipulator.getRelativeCenter().x,
                relativeY: manipulator.getRelativeCenter().y,
                baseAngle: baseAngle // angle to parent element
            },
            value = "",
            element = null,

            currentStateAction = NODE_STATE_ACTION_SELECT;

        this.setPosition = function(x, y) {

            visualNodeProps.x = x;
            visualNodeProps.y = y;
            updateView();

        };

        this.setRadius = function(r) {

            visualNodeProps.r = r;
            updateView();

        };

        this.setChild = function(node) {

            if (!(node instanceof Node)) return;

            for (var i in CHILD_NODES) {
                if (!CHILD_NODES.hasOwnProperty(i)) continue;
                if (CHILD_NODES[i] === node) return;
            }

            CHILD_NODES.push(node);

        };

        this.setValue = function(text) {

            value = text;
            try {
                element.childNodes[0].childNodes[0].innerHTML = value;
            } catch (e) {
                console.error("Unable to set value to node DOM element", e);
            }

        };

        this.setIndex = function(index) { // @improve (value method)

            INDEX = index;
            _this.updateValue();

        };

        this.setZIndex = function(z) {

            if (element) element.style.zIndex = z;

        };

        this.setBaseAngle = function(angle) {

            visualNodeProps.baseAngle = angle;

        };

        this.changeStateAction = function(delta) {

            currentStateAction =
                Math.round(currentStateAction + NODE_STATE_ACTIONS + delta) % NODE_STATE_ACTIONS;
            _this.childController.updateView();

        };

        this.getX = function() { return visualNodeProps.x; };
        this.getY = function() { return visualNodeProps.y; };
        this.getR = function() { return visualNodeProps.r; };
        this.getParent = function() { return PARENT_NODE; };
        this.getIndex = function() { return INDEX; };
        this.getStateAction = function() { return currentStateAction; };

        this.getPath = function() {

            var path = [INDEX],
                parentNode = PARENT_NODE;

            while (parentNode) {
                path.unshift(parentNode.getIndex());
                parentNode = parentNode.getParent();
            }

            return path;

        };

        this.getChildNode = function(nodeIndex) {

            return _this.childController.getChildNodeByIndex(nodeIndex);

        };

        this.childController = new function() {

            var __this = this,
                node = _this,
                child = [], // full child node data [string]
                beams = {
                    // index: { index: Number, beam: Beam }
                },
                ADDITIONAL_CHILD = 0,
                MAX_VISUAL_ELEMENTS = 15,
                INITIAL_ELEMENT_NUMBER = 30,
                SELECTED_INDEX = 0,
                VISUAL_SELECTED_INDEX = 0, // for animation
                updateViewInterval = 0,
                NODES_FREE_ALIGN = true; // shows if place nodes free (not to fix them with selector)

            /**
             * Function updates extra child control according to current NODES_FREE_ALIGN constant.
             */
            var resetExtraChild = function() {

                child[-1] = undefined;
                child[-2] = undefined;

                var search = {
                        name: "jump to node",
                        value: "<img class=\"jumpIcon\"/>",
                        trigger: TRIGGER_JUMP
                    },
                    add = {
                        name: "add node",
                        value: "<img class=\"addIcon\"/>",
                        trigger: TRIGGER_ADD
                    };

                if (NODES_FREE_ALIGN) {
                    ADDITIONAL_CHILD = 1;
                    child[-1] = add;
                } else {
                    ADDITIONAL_CHILD = 2;
                    child[-1] = add;
                    child[-2] = search;
                }

            };

            /**
             * Return child node with given name = index.
             *
             * @param index
             */
            this.getChildNodeByIndex = function(index) {

                var node;

                for (var b in beams) {
                    if (!beams.hasOwnProperty(b)) continue;
                    node = beams[b].beam.getNode();
                    if (node.getIndex() === index) {
                        return node;
                    }
                }

                return null;

            };

            /**
             * Enters to selected node.
             */
            this.triggerEvent = function() { // @update SELECTED_INDEX => argument

                if (!beams[SELECTED_INDEX]) return;

                switch (currentStateAction) {
                    case NODE_STATE_ACTION_SELECT: {
                        __this.handleSelect();
                    } break;
                    case NODE_STATE_ACTION_EDIT: {
                        __this.handleEdit();
                    } break;
                    case NODE_STATE_ACTION_DELETE: {
                        __this.handleDelete();
                    }
                }

            };

            var handleTrigger = function(trigger) {

                console.log("Trigger handled");

            };

            this.handleSelect = function() {

                var beam = beams[SELECTED_INDEX].beam,
                    node = beam.getNode(),
                    nodeIndex = node.getIndex();

                if (typeof nodeIndex === "object" && typeof nodeIndex.trigger !== "undefined") {
                    handleTrigger(nodeIndex.trigger);
                    return;
                }

                beam.setRadius(beam.getInitialRadius()*2.5); // @split to function
                node.initChild();
                TREE_ROOT.setTriggeringNode(node);

            };

            this.handleEdit = function() {

                alert("Edit");

            };

            this.handleDelete = function() {

                alert("Delete?");

            };

            this.updateSelectedIndex = function(indexDelta) {

                var last = SELECTED_INDEX;

                if (NODES_FREE_ALIGN) {
                    SELECTED_INDEX = (SELECTED_INDEX + indexDelta + child.length + ADDITIONAL_CHILD)
                        % (child.length + ADDITIONAL_CHILD);
                } else {
                    SELECTED_INDEX = Math.max(-ADDITIONAL_CHILD, Math.min(child.length - 1, SELECTED_INDEX + indexDelta));
                    if (last !== SELECTED_INDEX) {
                        try {
                            beams[last].beam.setRadius(beams[last].beam.getInitialRadius());
                            beams[last].beam.getNode().childController.removeBeams();
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }

                if (SELECTED_INDEX + MAX_VISUAL_ELEMENTS/2 > child.length) {
                    updateFromModel();
                }

                if (last !== SELECTED_INDEX) alignSubNodes();

            };

            this.removeBeams = function() {

                for (var i in beams) {
                    if (!beams.hasOwnProperty(i)) continue;
                    beams[i].beam.remove();
                    delete beams[i];
                }

            };

            /**
             * Server data update chain handler. Function forces to make requests to dataAdapter again.
             */
            this.update = function() {

                var length = child.length;

                updateFromModel();

                if (child.length !== length) { // @test
                    alignSubNodes();
                }

            };

            /**
             * Request data.
             */
            var updateFromModel = function() {

                var fromIndex = Math.max(child.length - 1, 0),
                    level = DATA_ADAPTER.getLevel(node.getPath(), INITIAL_ELEMENT_NUMBER, child[fromIndex]);

                for (var i = 0; i < level.length; i++) {
                    child[fromIndex + i] = level[i];
                }

                if (level.length + fromIndex - 1 > MAX_VISUAL_ELEMENTS) {
                    NODES_FREE_ALIGN = false;
                }

                resetExtraChild();

            };

            var alignSubNodes = function() {

                var getBeamsNumber = function() {

                    var bm = 0;

                    for (var i in beams) {
                        if (!beams.hasOwnProperty(i)) continue;
                        bm++;
                    }

                    return bm;

                };

                if (NODES_FREE_ALIGN) {

                    // this weird code does the next: removes beams for ADDITIONAL_CHILD from the end & pushes loaded
                    // elements. E.g. replaces [x, x, x, ADDITIONAL, ADDITIONAL, ...] to [x, x, x, newX, newX]
                    // useful when dataAdapter updates.
                    for (var u = Math.max(getBeamsNumber() - ADDITIONAL_CHILD, 0); u < child.length + ADDITIONAL_CHILD; u++) {
                        if (beams[u]) beams[u].beam.remove();
                        beams[u] = {
                            index: u,
                            beam: new Beam(node, (u<child.length)?child[u]:child[child.length-u-1], 0, 0)
                        };
                    }

                } else {

                    var fromIndex = Math.max(Math.ceil(SELECTED_INDEX - MAX_VISUAL_ELEMENTS/2), -ADDITIONAL_CHILD),
                        toIndex = Math.min(Math.floor(SELECTED_INDEX + MAX_VISUAL_ELEMENTS/2), child.length),
                        deprecatedBeams = [ /* { index, beam } */ ],
                        i, tempBeam;

                    for (i in beams) {
                        if (!beams.hasOwnProperty(i)) continue;
                        if (i < fromIndex || i >= toIndex) {
                            deprecatedBeams.push(beams[i]);
                            delete beams[i];
                        }
                    }

                    for (i = fromIndex; i < toIndex; i++) {

                        if (beams.hasOwnProperty(i.toString())) { // update
                            if (typeof beams[i].beam.getSubPath() === "object") { // override trigger
                                beams[i].beam.remove();
                            } else {
                                continue; // skip iteration (else-branch)
                            }
                        }

                        if (deprecatedBeams.length) { // reset
                            tempBeam = deprecatedBeams.pop();
                            tempBeam.beam.setSubPathName(child[i]);
                            tempBeam.index = i;
                            beams[i] = tempBeam;
                            //tempNode = tempBeam.getNode();
                            //tempNode.setValue(dataAdapter.getValue(tempNode.getPath())); // @wrong! SetPath!!!
                        } else { // create
                            beams[i] = { index: i, beam: new Beam(node, child[i], 0, 0)};
                        }

                    }

                    for (i = 0; i < deprecatedBeams.length; i++) { // delete
                        deprecatedBeams[i].beam.remove();
                    }

                }

                __this.forceViewUpdate();
                __this.updateView();

            };

            this.updateView = function () {

                if (NODES_FREE_ALIGN) {
                    viewFreeUpdater();
                    updateViewInterval = 0;
                    return;
                }

                if (!updateViewInterval) {
                    updateViewInterval = setInterval(viewScrollUpdater, 25);
                }

            };

            this.forceViewUpdate = function() {

                if (NODES_FREE_ALIGN) {
                    viewFreeUpdater();
                    updateViewInterval = 0;
                    return;
                }

                clearInterval(updateViewInterval);
                updateViewInterval = 0;
                viewScrollUpdater()

            };

            var getAppropriateStateActionClassname = function() {

                switch (currentStateAction) {
                    case NODE_STATE_ACTION_SELECT: return CSS_CLASSNAME_SELECT; break;
                    case NODE_STATE_ACTION_EDIT: return CSS_CLASSNAME_EDIT; break;
                    case NODE_STATE_ACTION_DELETE: return CSS_CLASSNAME_DELETE; break;
                    default: return CSS_EMPTY_CLASSNAME;
                }

            };

            var viewFreeUpdater = function() {

                var i = 0,
                    mi = child.length + ADDITIONAL_CHILD,//mi = (child.length + ADDITIONAL_CHILD < 1)?1:(child.length + ADDITIONAL_CHILD),
                    angle, dAngle, aAngle, bAngle,
                    baseAngleDefined = (visualNodeProps.baseAngle !== undefined)?1:0;

                // @weirdMath
                for (var b in beams) {
                    if (!beams.hasOwnProperty(b)) continue;
                    beams[b].beam.highlight(
                        (SELECTED_INDEX === beams[b].index)?getAppropriateStateActionClassname():CSS_EMPTY_CLASSNAME
                    ); // @improve
                    if (baseAngleDefined) {
                        bAngle = 0;
                        aAngle = Math.PI;
                        aAngle = Math.min(aAngle, Math.PI/6*mi);
                        dAngle = aAngle/(mi || 1);
                    } else {
                        bAngle = (1/mi)*2*Math.PI/2;
                        aAngle = 2*Math.PI - (1/mi)*2*Math.PI;
                        dAngle = aAngle/(mi || 1);
                    }

                    angle = Geometry.normalizeAngle(
                        (visualNodeProps.baseAngle || 0) + Math.PI - ((mi > 1)?aAngle/2:0) + (i/(mi - 1 || 1))*aAngle
                        - bAngle
                    ) || 0;
                    /*if (visualNodeProps.baseAngle !== undefined) {
                        angle = Geometry.normalizeAngle(visualNodeProps.baseAngle + Math.PI/2 + Math.PI*i/(mi - 1));
                        dAngle = Math.PI/mi;
                    } else {
                        angle = 2*Math.PI*i/mi;
                        dAngle = 2*Math.PI/mi;
                    }*/
                    if (!beams[b].beam.getInitialRadius()) {
                        beams[b].beam.setRadius(Math.max(
                            beams[b].beam.getNode().getR()/Math.tan(dAngle/2),
                            beams[b].beam.getNode().getR() + node.getR() + MIN_NODES_DISTANCE
                        ));
                    }
                    beams[b].beam.setAngle(angle);
                    i++;
                }

            };

            var viewScrollUpdater = function() { // work with indexes: display child array

                var delta, d;

                VISUAL_SELECTED_INDEX += delta = (SELECTED_INDEX - VISUAL_SELECTED_INDEX)/2.5;

                if (Math.abs(delta) < 0.001) {
                    VISUAL_SELECTED_INDEX = SELECTED_INDEX;
                    clearInterval(updateViewInterval);
                    updateViewInterval = 0;
                }

                for (var b in beams) {
                    if (!beams.hasOwnProperty(b)) continue;
                    d = beams[b].index - VISUAL_SELECTED_INDEX;
                    beams[b].beam.highlight(
                        (SELECTED_INDEX === beams[b].index)?getAppropriateStateActionClassname():CSS_EMPTY_CLASSNAME
                    ); // @improve
                    if (!beams[b].beam.getInitialRadius()) {
                        beams[b].beam.setRadius(Math.max(
                            beams[b].beam.getNode().getR()/Math.tan(Math.PI*2/MAX_VISUAL_ELEMENTS),
                            beams[b].beam.getNode().getR() + node.getR() + MIN_NODES_DISTANCE
                        ));
                    }
                    beams[b].beam.setZIndex(-Math.round(d*d) + 200);
                    beams[b].beam.setAngle(Math.atan(Math.PI/1.4*d*2/MAX_VISUAL_ELEMENTS * 2)*2 + visualNodeProps.baseAngle + Math.PI);
                }

            };

            __this.init = function() {

                updateFromModel();
                alignSubNodes();

            };

        };

        /**
         * Joins node to the parent node.
         */
        var joinParent = function(parentNode) {

            if (!(parentNode instanceof Node)) return;

            parentNode.setChild(_this);

        };

        var createNodeElement = function() {

            var el = document.createElement("DIV");
            el.className = CSS_CLASSNAME_NODE;
            el.innerHTML = "<div><span>" + value + "</span></div>";
            DOM_ELEMENTS.FIELD.appendChild(el);
            return el;

        };

        var updateView = function() {

            // @optimize: -r to set* methods
            var x = Math.round(visualNodeProps.relativeX + visualNodeProps.x - visualNodeProps.r),
                y = Math.round(visualNodeProps.relativeY + visualNodeProps.y - visualNodeProps.r);

            if (USE_HARDWARE_ACCELERATION) {

                element.style["transform"] = element.style["-ms-transform"] = element.style["-o-transform"] =
                    element.style["-moz-transform"] = element.style["-webkit-transform"] = "translate3d(" +
                        x + "px, " +
                        y + "px, 0)";

            } else {

                element.style.left = x + "px";
                element.style.top = y + "px";

            }

            element.style.width = element.style.height = visualNodeProps.r*2 + "px";

        };

        this.initChild = function() {

            _this.childController.init();

        };

        /**
         * Gives control to parent node.
         */
        this.back = function() {

            var parent = _this.getParent();

            if (!parent) return;

            TREE_ROOT.setTriggeringNode(parent);

        };

        this.remove = function() {

            if (element) element.parentNode.removeChild(element);
            _this.childController.removeBeams();

        };

        this.updateValue = function() {

            if (typeof INDEX === "object") {
                _this.setValue(INDEX.value);
            } else {
                _this.setValue(DATA_ADAPTER.getValue(_this.getPath()));
            }

        };

        /**
         * Make node glow (highlight node).
         *
         * @param CSSClassName {Boolean}
         */
        this.highlight = function(CSSClassName) {

            element.className = CSS_CLASSNAME_NODE + " " + CSSClassName;

        };

        _this.handle = {

            updateChild: function() {

                _this.childController.update();

            }

        };

        var init = function() {

            joinParent(PARENT_NODE);

            element = createNodeElement();
            _this.setPosition(startX, startY);
            _this.setRadius((parentNode != null)?TREE_NODE_RADIUS:BASE_NODE_RADIUS);

            _this.setIndex(initialIndex);
            updateView();

        };

        init();

    };

    /**
     * Connects parentNode and node with position controlling under node.
     *
     * @param parentNode
     * @param subPath
     * [ @param initialAngle ]
     * [ @param initialRadius ]
     *
     * @constructor
     */
    var Beam = function(parentNode, subPath, initialAngle, initialRadius) {

        var visualBeamProps = {
                angle: Geometry.normalizeAngle(initialAngle || 0),
                r: initialRadius || 100,
                relativeX: manipulator.getRelativeCenter().x,
                relativeY: manipulator.getRelativeCenter().y,
                initialRadius: initialRadius,
                WIDTH_EXPAND: 2,
                HALF_HEIGHT: 3 // @override
            },
            node = new Node(
                parentNode,
                subPath,
                Geometry.normalizeAngle(visualBeamProps.angle + Math.PI),
                0,
                0
            ),
            element = null;

        var createBeamElement = function() {

            var el = document.createElement("DIV");
            el.className = CSS_CLASSNAME_LINK;
            el.innerHTML = "<div><div><div><span>" +
                ((typeof subPath !== "object")?subPath:subPath.name)
                + "</span></div></div></div>"; // @structured
            DOM_ELEMENTS.FIELD.appendChild(el);

            visualBeamProps.HALF_HEIGHT = parseFloat(el.clientHeight)/2 || 3;

            return el;

        };

        this.setAngle = function(direction) {

            visualBeamProps.angle = Geometry.normalizeAngle(direction);
            node.setBaseAngle(Geometry.normalizeAngle(visualBeamProps.angle + Math.PI));
            updateView();

        };

        this.setRadius = function(radius) {

            if (!visualBeamProps.initialRadius) visualBeamProps.initialRadius = radius;

            visualBeamProps.r = radius;
            updateView();

        };

        this.setZIndex = function(z) {

            if (element) element.style.zIndex = 11 + z;
            if (node) node.setZIndex(12 + z);

        };

        this.remove = function() {

            if (element) element.parentNode.removeChild(element);
            if (node) node.remove();

        };

        this.setSubPathName = function(index) {

            subPath = index;
            try {
                element.childNodes[0].childNodes[0].childNodes[0].childNodes[0].innerHTML =
                    (typeof subPath !== "object")?subPath:subPath.name;
            } catch (e) {
                console.error("Unable to set value to beam DOM element", e);
            }
            node.setIndex(index);

        };

        /**
         * Make link glow (highlight link).
         *
         * @param CSSClassName {Boolean}
         */
        this.highlight = function(CSSClassName) {

            element.className = CSS_CLASSNAME_LINK + " " + CSSClassName;
            if (node) node.highlight(CSSClassName);

        };

        this.getNode = function() { return node; };
        this.getSubPath = function() { return subPath; };
        this.getParentNode = function() { return parentNode; };
        this.getAngle = function() { return visualBeamProps.angle; };
        this.getRadius = function() { return visualBeamProps.r; };
        this.getInitialRadius = function() { return visualBeamProps.initialRadius; };

        var updateElementPosition = function() {

            if (!parentNode || !node) return;

            /*
            * The transformations here based on relative y-shift within angle (for line height/2) pixels and rotation
            * around the left top corner of "link" box for given angle. Note that constants WIDTH_EXPAND and HALF_HEIGHT
            * are dependent from CSS.
            **/

            var x1 = parentNode.getX() - visualBeamProps.HALF_HEIGHT*Math.cos(visualBeamProps.angle + Math.PI/2),
                y1 = parentNode.getY() - visualBeamProps.HALF_HEIGHT*Math.sin(visualBeamProps.angle + Math.PI/2),
                r = parentNode.getR() - visualBeamProps.WIDTH_EXPAND,
                w = Math.sqrt(Math.pow(node.getX() - parentNode.getX(), 2) +
                    Math.pow(node.getY() - parentNode.getY(), 2)) - r - node.getR() + visualBeamProps.WIDTH_EXPAND*2,
                boxElement = element.childNodes[0].childNodes[0];

            if (w > visualBeamProps.WIDTH_EXPAND) {
                if (w < 60) {
                    boxElement.style.display = "none";
                } else {
                    boxElement.style.display = "block";
                }
                element.style.display = "block";
                element.style.width = Math.round(w) + "px";
            } else {
                element.style.display = "none";
                return;
            }

            if (USE_HARDWARE_ACCELERATION) {

                element.style["transform"] = element.style["-ms-transform"] = element.style["-o-transform"] =
                    element.style["-moz-transform"] = element.style["-webkit-transform"] = "translate3d(" +
                        (visualBeamProps.relativeX + x1 + r*Math.cos(visualBeamProps.angle)) + "px, " +
                        (visualBeamProps.relativeY + y1 + r*Math.sin(visualBeamProps.angle)) + "px, 0) rotate(" +
                        visualBeamProps.angle + "rad)";
                boxElement.style["transform"] = boxElement.style["-ms-transform"] = boxElement.style["-o-transform"] =
                    boxElement.style["-moz-transform"] = boxElement.style["-webkit-transform"] = "rotate(" +
                        ((visualBeamProps.angle < Math.PI/2 || visualBeamProps.angle > Math.PI + Math.PI/2)?0:180) + "deg)";

            } else {

                element.style.visibility = "hidden"; // @improve: svg

            }

        };

        var updateView = function() {

            node.setPosition(
                parentNode.getX() + visualBeamProps.r*Math.cos(visualBeamProps.angle),
                parentNode.getY() + visualBeamProps.r*Math.sin(visualBeamProps.angle)
            );
            updateElementPosition();

        };

        var init = function() {

            element = createBeamElement();
            updateView();

        };

        init();

    };

    /**
     * Tree root has basic tree control capabilities.
     */
    var TreeRoot = function() {

        var _this = this,
            rootNode = null,
            triggeringNode = null;

        var init = function() {

            rootNode = new Node(null, "root", undefined, 0, 0);
            triggeringNode = rootNode;
            rootNode.initChild();

        };

        var getNodeByPath = function(path) {

            var node = rootNode;

            for (var i = 0; i < path.length; i++) {
                if (!node) break;
                node = node.getChildNode(path[i]);
            }

            return node || null;

        };

        this.getNodeByPath = getNodeByPath;

        /**
         * @override
         * @param path
         */
        dataAdapter.childUpdated = function(path) {

            var node = getNodeByPath(path);
            if (node) triggeringNode.handle.updateChild();

        };

        /**
         * @override
         * @param path
         */
        dataAdapter.nodeValueUpdated = function(path) {

            var node = getNodeByPath(path);
            if (node) node.updateValue();

        };

        /**
         * Scroll nodes for delta. Delta = 1 will scroll to 1 next node.
         *
         * @param delta
         */
        this.scrollEvent = function(delta) {

            if (triggeringNode) triggeringNode.childController.updateSelectedIndex(delta);

        };

        this.triggerEvent = function() {

            if (triggeringNode) triggeringNode.childController.triggerEvent();

        };

        this.backEvent = function() {

            if (triggeringNode) triggeringNode.back();

        };

        this.setTriggeringNode = function(node) {

            if (!(node instanceof Node)) return;
            triggeringNode = node;

            manipulator.setViewCenter(node.getX(), node.getY());

        };

        /**
         * Removes the tree.
         */
        this.remove = function() {

            if (rootNode) rootNode.remove();
            triggeringNode = null;
            rootNode = null;

        };

        /**
         * Changes type of action which will be performed on selected subnodes.
         */
        this.changeStateAction = function(delta) {
            if (triggeringNode) {
                triggeringNode.changeStateAction(delta);
            }
        };

        init();

    };

    /**
     * Switches control to application (enables handlers)
     */
    this.switchControl = function(enabled) {

        ACTION_HANDLERS_ON = enabled?true:false;

    };

    /**
     * Update the viewport.
     */
    this.updateViewport = function() {

        if (manipulator) manipulator.viewportUpdated();

    };

    /**
     * Set of handlers.
     */
    this.handle = {

        connectionClose: function() {



        }

    };

    /**
     * Resets tree root for new or existing adapter. Adapter will be reset too.
     *
     * [ @param adapter ]
     */
    this.resetTreeRoot = function(adapter) {

        if (TREE_ROOT) {
            TREE_ROOT.remove();
        }

        // todo: unit/method testing
        if (adapter) {
            DATA_ADAPTER = adapter;
        }

        DATA_ADAPTER.reset();

        TREE_ROOT = new TreeRoot();

    };

    this.test = function(path) {

        return TREE_ROOT.getNodeByPath(path);

    };

    /**
     * Initialize application.
     */
    this.init = function() {

        USE_HARDWARE_ACCELERATION = transformsSupport();

        setElements(); // variables setup

        manipulator = new Manipulator();
        manipulator.initialize();

        TREE_ROOT = new TreeRoot();

        uiController.init();
        uiController.switchConnectForm();

    }

};