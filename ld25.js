window.LD25 = function()
{
    "use strict";

    var gCanvas;
    var gCtx;

    var gIsLoadComplete = false;
    var gPrevIsLoadComplete = false;

    var gIsGameOver = false;
    var gIsGameWon = false;
    var gIsPaused = false;
    var gIsMuted = false;

    var gDeltaX = 1;
    var gDeltaY = 24;
    var gCameraPosition;
    var gLastUpdateTime = 0;
    var gInitTime = 0;
    var gStartTime = 0;
    var gCurrTime = 0;
    var gTimeDelta = 0;

    var DIR_LEFT = -1;
    var DIR_RIGHT = 1;

    var indexer;

    indexer = 0;
    var BRAIN_PLAYER = indexer++;
    var BRAIN_ENEMY = indexer++;
    var BRAIN_ARK = indexer;

    indexer = 0;
    var KEY_UP = indexer++;
    var KEY_DOWN = indexer++;
    var KEY_LEFT = indexer++;
    var KEY_RIGHT = indexer++;
    var KEY_SPACE = indexer++;
    var KEY_PAUSE = indexer++;
    var KEY_MUTE = indexer++;
    var gKeys = new Array(indexer);
    var gPrevKeys = new Array(indexer);

    indexer = 0;
    var IMG_PLAYER = indexer++;
    var IMG_ENEMY = indexer++;
    var IMG_ARK = indexer++;
    var IMG_BG_GREEN = indexer++;
    var IMG_BG_WATER = indexer++;
    var gImageList = new Array(indexer);

    indexer = 0;
    var AUD_TRACK = indexer++;
    var AUD_JUMP01 = indexer++;
    var AUD_JUMP02 = indexer++;
    var AUD_JUMP03 = indexer++;
    var AUD_PICKUP01 = indexer++;
    var AUD_PICKUP02 = indexer++;
    var AUD_HURT01 = indexer++;
    var AUD_HURT02 = indexer++;
    var AUD_DEATH01 = indexer++;
    var AUD_EXPLODE01 = indexer++;
    var gAudioList = new Array(indexer);

    var gEntityList = [];
    var gGroundList = [];
    var gWaterList = [];


    /**
     * @param x
     * @param y
     * @constructor
     */
    function Point2D(x, y)
    {
        this.x = x;
        this.y = y;
    }

    Point2D.prototype.magnitude = function()
    {
        if ((this.x === 0) && (this.y === 0))
        {
            return 0.0;
        }
        return Math.sqrt(this.x*this.x + this.y*this.y);
    };
    Point2D.prototype.add = function(other)
    {
        this.x += other.x;
        this.y += other.y;
    };
    Point2D.prototype.subtract = function(other)
    {
        this.x -= other.x;
        this.y -= other.y;
    };
    Point2D.prototype.multiply = function(other)
    {
        this.x *= other.x;
        this.y *= other.y;
    };

    /**
     * @param start
     * @param control
     * @param end
     * @constructor
     */
    function CurveSegment(start, control, end)
    {
        this.start = start;
        this.control = control;
        this.end = end;
    }

    /**
     * @param seg
     * @param x
     * @return {Number}
     */
    function GetTAlongQuadraticCurve(seg, x)
    {
        var a = seg.start.x;
        var b = seg.control.x;
        var c = seg.end.x;

        var t;
        if (Math.abs((2*b - c) - a) < 0.001)
        {
            t = (2*b - c - x) / (2*(b - c));
        }
        else
        {
            var sqrt_res = Math.sqrt(-a*c + a*x + b*b - 2*b*x + c*x);
            //var t0 = ( sqrt_res - a + b) / (-a + 2 * b - c);
            t = (-sqrt_res - a + b) / (-a + 2 * b - c);
        }

        return t;
    }

    /**
     * @param seg
     * @param t
     * @return {Point2D}
     */
    function GetQuadraticCurvePoint(seg, t)
    {
        var invT = 1.0 - t;

        var p0 = seg.start;
        var p1 = seg.control;
        var p2 = seg.end;

        return new Point2D((invT * invT * p0.x) + (2.0 * invT * t * p1.x) + (t * t * p2.x),
            (invT * invT * p0.y) + (2.0 * invT * t * p1.y) + (t * t * p2.y));
    }

    /**
     * @param seg
     * @param t
     * @return {Point2D}
     */
    function GetQuadraticCurveTangent(seg, t)
    {
        var invT = 1.0 - t;

        var p0 = seg.start;
        var p1 = seg.control;
        var p2 = seg.end;

        var p1Mp0 = new Point2D(p1.x, p1.y);
        p1Mp0.subtract(p0);
        var p2Mp1 = new Point2D(p2.x, p2.y);
        p2Mp1.subtract(p1);

        return new Point2D((2.0 * invT * p1Mp0.x) + (2.0 * t * p2Mp1.x),
            (2.0 * invT * p1Mp0.y) + (2.0 * t * p2Mp1.y));
    }

    /**
     * @param curveList
     * @param x
     * @return {Number}
     */
    function CurveHeightAt(curveList, x)
    {
        for (var i=0; i<curveList.length; i++)
        {
            var seg = curveList[i];
            if ((x >= seg.start.x) && (x <= seg.end.x))
            {
                var t = GetTAlongQuadraticCurve(seg, x);
                var pos = GetQuadraticCurvePoint(seg, t);

                return pos.y;
            }
        }

        return 0;
    }

    /**
     * @param x
     * @return {Number}
     */
    function WaterHeightAt(x)
    {
        return CurveHeightAt(gWaterList, x);
    }

    /**
     * @param x
     * @return {Number}
     */
    function GroundHeightAt(x)
    {
        return CurveHeightAt(gGroundList, x);
    }

    /**
     * @param curveList
     * @param x
     * @return {Point2D}
     */
    function CurveTangentAt(curveList, x)
    {
        for (var i=0; i<curveList.length; i++)
        {
            var seg = curveList[i];
            if ((x >= seg.start.x) && (x <= seg.end.x))
            {
                var t = GetTAlongQuadraticCurve(seg, x);
                return GetQuadraticCurveTangent(seg, t);
            }
        }

        return new Point2D(1, 0);
    }

    /**
     * @param img
     * @param size
     * @param x
     * @param y
     * @param direction
     * @param brain
     * @param life
     * @param attack
     * @constructor
     */
    function GameEntity(img, size, x, y, direction, brain, life, attack)
    {
        this.image = img;
        this.size = size;

        this.position = new Point2D(x, y);
        this.velocity = new Point2D(0, 0);
        this.direction = direction;

        this.life = life;
        this.attack = attack;
        this.invulnerableTimeRemaining = 0;

        this.isPlayer = (brain === BRAIN_PLAYER);
        if (brain === BRAIN_PLAYER)
            this.runAI = this.PlayerBrain;
        else if (brain === BRAIN_ENEMY)
            this.runAI = this.EnemyBrain;
        else if (brain === BRAIN_ARK)
            this.runAI = this.ArkBrain;
    }

    GameEntity.prototype.GenericBrain = function()
    {
        if (this.invulnerableTimeRemaining > 0)
        {
            this.invulnerableTimeRemaining -= gTimeDelta;
            if (this.invulnerableTimeRemaining < 0)
            {
                this.invulnerableTimeRemaining = 0;
            }
        }

        var ext = new Point2D(this.position.x + ((this.size / 2.0) * this.direction), this.position.y);
        var extHeight = GroundHeightAt(ext.x);
        if (this.position.y < extHeight)
        {
            if ((this.velocity.x * this.direction) > 0)
            {
                this.velocity.x = 0.0;

                if (!this.isPlayer)
                {
                    this.direction *= -1.0;
                }
            }
        }

        this.position.add(this.velocity);

        var groundHeight = GroundHeightAt(this.position.x);
        if (this.position.y < (groundHeight + this.size / 2.0))
        {
            this.velocity.y = 0.0;
            this.position.y = groundHeight + (this.size / 2.0);
        }

        var waterHeight = WaterHeightAt(this.position.x);
        if ((waterHeight > groundHeight) && (this.position.y < waterHeight))
        {
            if (this.life > 0)
            {
                if (this.invulnerableTimeRemaining <= 0)
                {
                    if (this.isPlayer)
                    {
                        this.life -= 25;
                        this.invulnerableTimeRemaining = 500;

                        if (this.life > 0)
                        {
                            var hurtSound = AUD_HURT01 + Math.floor(Math.random() * 2.0);
                            gAudioList[hurtSound][1].play();
                        }
                        else
                        {
                            gIsGameOver = true;
                            gAudioList[AUD_DEATH01][1].play();
                        }
                    }
                    else
                    {
                        // Long enough to get out of the water?
                        this.invulnerableTimeRemaining = 500;

                        if ((this.velocity.x * this.direction) > 0)
                        {
                            this.direction *= -1.0;
                        }
                    }
                }
            }
        }

        this.velocity.multiply(new Point2D(0.9, 0.9));
        this.velocity.add(new Point2D(0, -0.98));
    };

    GameEntity.prototype.PlayerBrain = function()
    {
        if (gKeys[KEY_LEFT])
        {
            this.velocity.x -= gDeltaX;
            this.direction = DIR_LEFT;
        }
        if (gKeys[KEY_RIGHT])
        {
            this.velocity.x += gDeltaX;
            this.direction = DIR_RIGHT;
        }

        if (gKeys[KEY_SPACE] && !gPrevKeys[KEY_SPACE])
        {
            var groundHeight = GroundHeightAt(this.position.x);
            if (this.position.y < (groundHeight + (this.size * 0.75)))
            {
                var jumpSound = AUD_JUMP01 + Math.floor(Math.random() * 2.0);
                gAudioList[jumpSound][1].play();

                if (this.velocity.y >= 0)
                {
                    this.velocity.y += gDeltaY;
                }
                else
                {
                    this.velocity.y = gDeltaY;
                }
            }
        }

        this.GenericBrain();

        // Check for damage/death after the generic brain is run, as that will fix up the height for the ground (very steep slopes will be an issue otherwise)
        for (var i=0; i<gEntityList.length; i++)
        {
            var otherEntity = gEntityList[i];
            if (!otherEntity.isPlayer && (otherEntity.life > 0))
            {
                var diff = new Point2D(this.position.x, this.position.y);
                diff.subtract(otherEntity.position);
                var dist = diff.magnitude();

                var radiiSum = (this.size/2.0) + (otherEntity.size/2.0);
                if (dist < radiiSum)
                {
                    if ((this.position.y - (this.size / 2.0)) > otherEntity.position.y)
                    {
                        otherEntity.life -= this.attack;
                        this.velocity.y = 8.0;

                        if (otherEntity.life <= 0)
                        {
                            var pickupSound = AUD_PICKUP01 + Math.floor(Math.random() * 2.0);
                            gAudioList[pickupSound][1].play();
                            gAudioList[AUD_JUMP03][1].play();
                        }
                    }
                    else
                    {
                        if (this.invulnerableTimeRemaining <= 0)
                        {
                            this.life -= otherEntity.attack;
                            this.invulnerableTimeRemaining = 2000;

                            var t = 1.0 - (dist / radiiSum);
                            diff.multiply(new Point2D(t, t));
                            this.velocity = diff;
                            this.velocity.y += 12.0;

                            if (this.life > 0)
                            {
                                var hurtSound = AUD_HURT01 + Math.floor(Math.random() * 2.0);
                                gAudioList[hurtSound][1].play();
                            }
                            else
                            {
                                gIsGameOver = true;
                                gAudioList[AUD_DEATH01][1].play();
                            }
                        }
                    }
                }
            }
        }
    };

    GameEntity.prototype.EnemyBrain = function()
    {
        if (this.life > 0)
        {
            if (Math.floor(Math.random() * 1000.0) < 4)
            {
                this.direction *= -1;
            }
            this.velocity.x += this.direction * (gDeltaX / 8.0);
        }

        this.GenericBrain();
    };

    GameEntity.prototype.ArkBrain = function()
    {
        // Do nothing
        if (!gIsGameWon && (this.life <= 0))
        {
            gIsGameWon = true;
            gAudioList[AUD_EXPLODE01][1].play();
        }
    };

    /**
     * @param pt
     * @return {Point2D}
     */
    function GameToCanvas(pt)
    {
        var cameraSpace = new Point2D(pt.x, pt.y);
        cameraSpace.subtract(gCameraPosition);
        var halfCanvas = new Point2D(Math.floor(gCanvas.width / 2), Math.floor(gCanvas.height / 2));
        cameraSpace.add(halfCanvas);
        return new Point2D(cameraSpace.x, gCanvas.height - cameraSpace.y);
    }

    /**
     * @return {Array}
     */
    function GetVisibleExtents()
    {
        var halfCanvasW = Math.ceil(gCanvas.width / 2);

        var extents = [];
        extents[0] = Math.floor(gCameraPosition.x - halfCanvasW);
        extents[1] = Math.ceil(gCameraPosition.x + halfCanvasW);

        return extents;
    }

    /**
     * @param entity
     */
    function DrawEntity(entity)
    {
        var visibleExtents = GetVisibleExtents();

        if (((entity.position.x+entity.size/2) >= visibleExtents[0]) &&
            ((entity.position.x-entity.size/2) <= visibleExtents[1]))
        {
            gCtx.save();

            var pos = GameToCanvas(entity.position);

            var img = gImageList[entity.image][1];
            var imgW = entity.size;
            var imgH = entity.size;
            var squish = 0.0;

            gCtx.translate(pos.x, pos.y);

            if (!entity.isPlayer && (entity.life <= 0))
            {
                squish = 1.0;

                var tangent = CurveTangentAt(gGroundList, entity.position.x);
                gCtx.rotate(-Math.atan2(tangent.y, tangent.x));
            }

            gCtx.scale(entity.direction, 1);

            gCtx.drawImage(img, -imgW/2, -imgH/2 + (squish * imgH*0.75), imgW, imgH - (squish * imgH*0.75));
            gCtx.translate(-pos.x, -pos.y);

            if (entity.isPlayer && (entity.life > 0) && (entity.invulnerableTimeRemaining > 0))
            {
                gCtx.strokeStyle = "white";
                gCtx.lineWidth = 4;

                gCtx.beginPath();
                gCtx.arc(pos.x, pos.y, entity.size / 2 + 8, 0, Math.PI * 2.0, true);
                gCtx.stroke();
            }

            gCtx.restore();
        }
    }

    /**
     */
    function DrawCurveList(curveList, fillImage, fillOffset, stroke)
    {
        if (curveList.length > 0)
        {
            var visibleExtents = GetVisibleExtents();

            gCtx.strokeStyle = stroke;

            var img = gImageList[fillImage][1];
            gCtx.fillStyle = gCtx.createPattern(img, "repeat");

            var i;

            for (i=0; (i<curveList.length) && (curveList[i].end.x < visibleExtents[0]); /**/)
            {
                i++;
            }
            var firstIdx = i;
            for (/**/; (i<curveList.length) && (curveList[i].start.x < visibleExtents[1]); /**/)
            {
                i++;
            }
            var lastIdx = i - 1;

            if ((firstIdx < curveList.length) && (firstIdx <= lastIdx))
            {
                var firstCurve = curveList[firstIdx];
                var firstPos = GameToCanvas(firstCurve.start);

                gCtx.beginPath();
                gCtx.moveTo(firstPos.x, firstPos.y);
                for (i=firstIdx; i<=lastIdx; i++)
                {
                    var curve = curveList[i];
                    var control = GameToCanvas(curve.control);
                    var end = GameToCanvas(curve.end);
                    gCtx.quadraticCurveTo(control.x, control.y, end.x, end.y);
                }
                gCtx.stroke();

                var lastCurve = curveList[lastIdx];
                var lastPos = GameToCanvas(lastCurve.end);
                var groundPos = GameToCanvas(new Point2D(0, 0));
                var originPos = GameToCanvas(curveList[0].start);
                originPos.add(fillOffset);

                gCtx.lineTo(lastPos.x, groundPos.y);
                gCtx.lineTo(firstPos.x, groundPos.y);
                gCtx.lineTo(firstPos.x, firstPos.y);
                gCtx.translate(originPos.x, originPos.y);
                gCtx.fill();
                gCtx.translate(-originPos.x, -originPos.y);
            }
        }
    }

    /**
     */
    function DrawWater()
    {
        var fillOffset = new Point2D(-((gCurrTime - gStartTime) / 5.0), 128.0);

        DrawCurveList(gWaterList, IMG_BG_WATER, fillOffset, "#1F9BFB");
    }

    /**
     */
    function DrawGround()
    {
        DrawCurveList(gGroundList, IMG_BG_GREEN, new Point2D(0, 0), "#65962C");
    }

    /**
     */
    function DrawLevel()
    {
        gCtx.save();

        gCtx.lineWidth = 10;

        DrawWater();
        DrawGround();

        gCtx.restore();
    }

    /**
     */
    function DrawEntities()
    {
        for (var i=0; i<gEntityList.length; i++)
        {
            DrawEntity(gEntityList[i]);
        }
    }

    function Clear()
    {
        gCtx.save();

        gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height);

        gCtx.fillStyle = "#9AE4FF";
        gCtx.strokeStyle = "black";
        gCtx.lineWidth = 1;

        gCtx.beginPath();
        gCtx.rect(0, 0, gCanvas.width, gCanvas.height);
        gCtx.fill();
        gCtx.stroke();

        gCtx.restore();
    }

    /**
     * @return {Boolean}
     */
    function ImagesLoaded()
    {
        for (var i=0; i<gImageList.length; i++)
        {
            if (!gImageList[i][0])
            {
                return false;
            }
        }

        return true;
    }

    /**
     * @return {Boolean}
     */
    function AudioLoaded()
    {
        // Only wait for 30s for audio to load, as many browsers currently have issues with preloading audio
        var currTime = Date.now();
        if ((currTime - gInitTime) > 30000)
        {
            return true;
        }

        for (var i=0; i<gAudioList.length; i++)
        {
            if (!gAudioList[i][0])
            {
                return false;
            }
        }

        return true;
    }

    /**
     * @return {Boolean}
     */
    function IsGameLoadComplete()
    {
        return ImagesLoaded() && AudioLoaded();
    }

    function onLoadComplete()
    {
        gStartTime = Date.now();

        for (var i=0; i<gAudioList.length; i++)
        {
            gAudioList[i][1].pause();
            //gAudioList[i][1].currentTime = 0.0;
            gAudioList[i][1].muted = false;
        }

        gAudioList[AUD_TRACK][1].volume = 0.667;
        gAudioList[AUD_JUMP01][1].volume = 1.0;
        gAudioList[AUD_JUMP02][1].volume = 1.0;
        gAudioList[AUD_JUMP03][1].volume = 0.25;
        gAudioList[AUD_PICKUP01][1].volume = 0.25;
        gAudioList[AUD_PICKUP02][1].volume = 0.25;
        gAudioList[AUD_HURT01][1].volume = 0.5;
        gAudioList[AUD_HURT02][1].volume = 0.5;
        gAudioList[AUD_DEATH01][1].volume = 0.25;
        gAudioList[AUD_EXPLODE01][1].volume = 1.0;

        gAudioList[AUD_TRACK][1].play();
    }

    /**
     * @param x
     * @param y
     * @param text
     * @param size
     * @param border
     * @param align
     * @param fill
     * @param stroke
     */
    function DrawText(x, y, text, size, border, align, fill, stroke)
    {
        gCtx.font = "bold " + size + "px Arial";
        gCtx.textAlign = align;

        gCtx.strokeStyle = stroke;
        gCtx.lineWidth = border;
        gCtx.strokeText(text, x, y);

        gCtx.fillStyle = fill;
        gCtx.fillText(text, x, y);
    }

    function DrawUI()
    {
        gCtx.save();

        DrawText(gCanvas.width-128, 64, "X: " + gEntityList[0].position.x, 12, 2, "left", "white", "black");

        DrawText(32, 32, "Health: " + ((gEntityList[0].life >= 0) ? gEntityList[0].life : 0), 24, 2, "left", "white", "black");

        if (gIsGameWon)
        {
            DrawText(gCanvas.width/2, gCanvas.height/2, "Winner!", 64, 6, "center", "#2080FF", "black");
        }
        else if (gIsGameOver)
        {
            DrawText(gCanvas.width/2, gCanvas.height/2, "Game Over", 64, 6, "center", "#C00000", "black");
        }

        gCtx.restore();
    }

    function Draw()
    {
        Clear();

        gPrevIsLoadComplete = gIsLoadComplete;
        gIsLoadComplete = IsGameLoadComplete();

        if (!gIsLoadComplete)
        {
            gCtx.save();

            gCtx.font = "bold 32px Arial";
            gCtx.textAlign = "center";

            gCtx.fillStyle = "#9659B3";
            gCtx.fillText("Loading...", gCanvas.width/2, gCanvas.height/2);

            gCtx.strokeStyle = "black";
            gCtx.lineWidth = 1;
            gCtx.strokeText("Loading...", gCanvas.width/2, gCanvas.height/2);

            gCtx.restore();

            return;
        }

        if (gIsLoadComplete && !gPrevIsLoadComplete)
        {
            onLoadComplete();
        }

        DrawLevel();

        DrawEntities();

        DrawUI();
    }

    function UpdateKeys()
    {
        if (!gKeys[KEY_PAUSE] && gPrevKeys[KEY_PAUSE])
        {
            gIsPaused = !gIsPaused;
        }

        if (!gKeys[KEY_MUTE] && gPrevKeys[KEY_MUTE])
        {
            gIsMuted = !gIsMuted;
            gAudioList[AUD_TRACK][1].muted = gIsMuted;
        }
    }

    function Update()
    {
        UpdateKeys();

        gCurrTime = Date.now();
        gTimeDelta = gCurrTime - gLastUpdateTime;

        if (!gIsPaused && !gIsGameOver && !gIsGameWon)
        {
            for (var i=0; i<gEntityList.length; i++)
            {
                gEntityList[i].runAI();
            }

            var halfW = Math.ceil(gCanvas.width / 2);
            var cameraLeft = gCameraPosition.x - halfW;
            var cameraRight = gCameraPosition.x + halfW;
            var scaledVelocity = new Point2D(gEntityList[0].velocity.x, gEntityList[0].velocity.y);
            scaledVelocity.multiply(new Point2D(48, 48));
            var cameraPadding = 256;
            if ((gEntityList[0].position.x + scaledVelocity.x) < (cameraLeft + cameraPadding))
            {
                var newLeft = (gEntityList[0].position.x + scaledVelocity.x) - cameraPadding;
                gCameraPosition.x = newLeft + halfW;
            }
            else if ((gEntityList[0].position.x + scaledVelocity.x) > (cameraRight - cameraPadding))
            {
                var newRight = (gEntityList[0].position.x + scaledVelocity.x) + cameraPadding;
                gCameraPosition.x = newRight - halfW;
            }
        }

        gLastUpdateTime = gCurrTime;
        gPrevKeys = gKeys.slice();
    }

    function processKeyEvent(keyCode, pressed)
    {
        switch (keyCode)
        {
            case 87:
            case 38:
                gKeys[KEY_UP] = pressed;
                break;

            case 83:
            case 40:
                gKeys[KEY_DOWN] = pressed;
                break;

            case 65:
            case 37:
                gKeys[KEY_LEFT] = pressed;
                break;

            case 68:
            case 39:
                gKeys[KEY_RIGHT] = pressed;
                break;

            case 32:
                gKeys[KEY_SPACE] = pressed;
                break;

            case 80:
                gKeys[KEY_PAUSE] = pressed;
                break;

            case 77:
                gKeys[KEY_MUTE] = pressed;
                break;
        }
    }

    function onKeyDown(evt)
    {
        processKeyEvent(evt.keyCode, true);
    }

    function onKeyUp(evt)
    {
        processKeyEvent(evt.keyCode, false);
    }

    function GameLoop()
    {
        window.requestAnimFrame(GameLoop);

        Update();
        Draw();
    }

    window.onResizeWindow = function()
    {
        var desiredAspectRatio = 16.0/9.0;
        var desiredW = window.innerWidth - 32;
        var desiredH = window.innerHeight - 32;

        if ((desiredW / desiredAspectRatio) <= desiredH)
        {
            desiredH = desiredW / desiredAspectRatio;
        }
        else
        {
            desiredW = desiredH * desiredAspectRatio;
        }

        if (gCanvas.width != desiredW)
        {
            gCanvas.width = desiredW;
        }
        if (gCanvas.height != desiredH)
        {
            gCanvas.height = desiredH;
        }

        gCameraPosition.y = gCanvas.height / 2;
    };

    function onImageLoaded(i)
    {
        gImageList[i][0] = true;
    }

    function LoadImage(i, src)
    {
        if (!gImageList[i][0])
        {
            gImageList[i][1].src = src;
        }
    }

    function onAudioLoaded(i)
    {
        gAudioList[i][0] = true;
        gAudioList[i][1].pause();
        //gAudioList[i][1].currentTime = 0.0;
        gAudioList[i][1].muted = false;
    }

    function AsyncLoadImages()
    {
        for (var i=0; i<gImageList.length; i++)
        {
            gImageList[i] = new Array(2);
            gImageList[i][0] = false;
            gImageList[i][1] = new Image;

            (function ()
            {
                var idx = i;
                gImageList[idx][1].onload = function()
                {
                    onImageLoaded(idx);
                };
            }
                )();
        }

        LoadImage(IMG_PLAYER, "assets/images/player.png");
        LoadImage(IMG_ENEMY, "assets/images/enemy.png");
        LoadImage(IMG_ARK, "assets/images/ark.png");
        LoadImage(IMG_BG_GREEN, "assets/images/bg_green.png");
        LoadImage(IMG_BG_WATER, "assets/images/bg_water.png");
    }

    function AsyncLoadAudio()
    {
        var i;
        for (i=0; i<gAudioList.length; i++)
        {
            gAudioList[i] = new Array(2);
            gAudioList[i][0] = false;
        }

        gAudioList[AUD_TRACK][1] = document.getElementById("track01");
        gAudioList[AUD_JUMP01][1] = document.getElementById("jump01");
        gAudioList[AUD_JUMP02][1] = document.getElementById("jump02");
        gAudioList[AUD_JUMP03][1] = document.getElementById("jump03");
        gAudioList[AUD_PICKUP01][1] = document.getElementById("pickup01");
        gAudioList[AUD_PICKUP02][1] = document.getElementById("pickup02");
        gAudioList[AUD_HURT01][1] = document.getElementById("hurt01");
        gAudioList[AUD_HURT02][1] = document.getElementById("hurt02");
        gAudioList[AUD_DEATH01][1] = document.getElementById("death01");
        gAudioList[AUD_EXPLODE01][1] = document.getElementById("explode01");

        for (i=0; i<gAudioList.length; i++)
        {
            (function ()
            {
                var idx = i;

                gAudioList[idx][1].addEventListener('canplaythrough', function() { onAudioLoaded(idx); }, false);

                gAudioList[idx][1].load();
                gAudioList[idx][1].volume = 0.0;
                gAudioList[idx][1].muted = true;
                gAudioList[idx][1].play();
            })();
        }
    }

    return {
        init: function()
        {
            gCanvas = document.getElementById("game");
            gCtx = gCanvas.getContext("2d");

            gCameraPosition = new Point2D(0, 0);
            window.onResizeWindow();
            gCameraPosition.x = gCanvas.width / 2;
            window.onresize = window.onResizeWindow();

            window.addEventListener('keydown', onKeyDown, true);
            window.addEventListener('keyup', onKeyUp, true);

            for (var i=0; i<gKeys.length; i++)
            {
                gKeys[i] = false;
            }
            gPrevKeys = gKeys.slice();

            var cnt = 0;
            gGroundList[cnt++] = new CurveSegment(new Point2D( -900, 400), new Point2D(    0, 900), new Point2D(    0, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D(    0, 100), new Point2D(  100, 150), new Point2D(  200, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D(  200, 100), new Point2D(  400, 200), new Point2D(  600, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D(  600, 100), new Point2D(  700, 150), new Point2D(  800, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D(  800, 100), new Point2D(  900, 150), new Point2D( 1000, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 1000, 100), new Point2D( 1400, 450), new Point2D( 1500, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 1500, 100), new Point2D( 1600, 175), new Point2D( 1700, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 1700, 100), new Point2D( 1800, 125), new Point2D( 1900, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 1900, 100), new Point2D( 2000, 150), new Point2D( 2100, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 2100, 100), new Point2D( 2150, 250), new Point2D( 2300, 250));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 2300, 250), new Point2D( 2500, 350), new Point2D( 2800, 250));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 2800, 250), new Point2D( 2950, 300), new Point2D( 3100, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 3100, 100), new Point2D( 3200, 150), new Point2D( 3300, 100));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 3300, 100), new Point2D( 3400, 450), new Point2D( 3600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D( 3600, 150), new Point2D( 3700, 200), new Point2D( 3800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 3800, 150), new Point2D( 4000, 250), new Point2D( 4200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 4200, 150), new Point2D( 4300, 200), new Point2D( 4400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 4400, 150), new Point2D( 4500, 200), new Point2D( 4600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D( 4600, 150), new Point2D( 4700, 200), new Point2D( 4800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 4800, 150), new Point2D( 5000, 250), new Point2D( 5200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 5200, 150), new Point2D( 5300, 200), new Point2D( 5400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 5400, 150), new Point2D( 5500, 200), new Point2D( 5600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D( 5600, 150), new Point2D( 5700, 200), new Point2D( 5800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 5800, 150), new Point2D( 6000, 250), new Point2D( 6200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 6200, 150), new Point2D( 6300, 200), new Point2D( 6400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 6400, 150), new Point2D( 6500, 200), new Point2D( 6600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D( 6600, 150), new Point2D( 6700, 200), new Point2D( 6800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 6800, 150), new Point2D( 7000, 250), new Point2D( 7200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 7200, 150), new Point2D( 7300, 200), new Point2D( 7400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 7400, 150), new Point2D( 7500, 200), new Point2D( 7600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D( 7600, 150), new Point2D( 7700, 200), new Point2D( 7800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 7800, 150), new Point2D( 8000, 250), new Point2D( 8200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 8200, 150), new Point2D( 8300, 200), new Point2D( 8400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 8400, 150), new Point2D( 8500, 200), new Point2D( 8600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D( 8600, 150), new Point2D( 8700, 200), new Point2D( 8800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 8800, 150), new Point2D( 9000, 250), new Point2D( 9200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 9200, 150), new Point2D( 9300, 200), new Point2D( 9400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 9400, 150), new Point2D( 9500, 200), new Point2D( 9600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D( 9600, 150), new Point2D( 9700, 200), new Point2D( 9800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D( 9800, 150), new Point2D(10000, 250), new Point2D(10200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(10200, 150), new Point2D(10300, 200), new Point2D(10400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(10400, 150), new Point2D(10500, 200), new Point2D(10600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D(10600, 150), new Point2D(10700, 200), new Point2D(10800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(10800, 150), new Point2D(11000, 250), new Point2D(11200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(11200, 150), new Point2D(11300, 200), new Point2D(11400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(11400, 150), new Point2D(11500, 200), new Point2D(11600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D(11600, 150), new Point2D(11700, 200), new Point2D(11800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(11800, 150), new Point2D(12000, 250), new Point2D(12200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(12200, 150), new Point2D(12300, 200), new Point2D(12400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(12400, 150), new Point2D(12500, 200), new Point2D(12600, 150));

            gGroundList[cnt++] = new CurveSegment(new Point2D(12600, 150), new Point2D(12700, 200), new Point2D(12800, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(12800, 150), new Point2D(13000, 250), new Point2D(13200, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(13200, 150), new Point2D(13300, 200), new Point2D(13400, 150));
            gGroundList[cnt++] = new CurveSegment(new Point2D(13400, 150), new Point2D(13500, 200), new Point2D(13600, 150));

            gGroundList[cnt  ] = new CurveSegment(new Point2D(13600, 150), new Point2D(13800,  50), new Point2D(14000,   0));

            cnt = 0;
            gWaterList[cnt++] = new CurveSegment(new Point2D(13700, 100), new Point2D(13800,  50), new Point2D(13900, 100));
            gWaterList[cnt++] = new CurveSegment(new Point2D(13900, 100), new Point2D(14000,  50), new Point2D(14100, 100));
            gWaterList[cnt++] = new CurveSegment(new Point2D(14100, 100), new Point2D(14200,  50), new Point2D(14300, 100));
            gWaterList[cnt++] = new CurveSegment(new Point2D(14300, 100), new Point2D(14400,  50), new Point2D(14500, 100));
            gWaterList[cnt++] = new CurveSegment(new Point2D(14500, 100), new Point2D(14600,  50), new Point2D(14700, 100));
            gWaterList[cnt++] = new CurveSegment(new Point2D(14700, 100), new Point2D(14800,  50), new Point2D(14900, 100));
            gWaterList[cnt  ] = new CurveSegment(new Point2D(14900, 100), new Point2D(15000,  50), new Point2D(15100, 100));

            cnt = 0;
            gEntityList[cnt++] = new GameEntity(IMG_PLAYER, 128,   200,   0, DIR_RIGHT, BRAIN_PLAYER, 100,  20);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,   500,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  1000,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  1500,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  1750,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  2450,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  2550,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  3150,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  3250,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  3500,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  3550,   0, DIR_RIGHT, BRAIN_ENEMY,   20,  35);
            gEntityList[cnt++] = new GameEntity(IMG_ENEMY,   64,  3600,   0, DIR_LEFT,  BRAIN_ENEMY,   20,  35);
            gEntityList[cnt  ] = new GameEntity(IMG_ARK,    256, 13900, 150, DIR_RIGHT, BRAIN_ARK,    200, 100);

            gInitTime = Date.now();

            AsyncLoadImages();
            AsyncLoadAudio();

            window.requestAnimFrame =
                (function()
                {
                    return window.requestAnimationFrame ||
                        window.webkitRequestAnimationFrame ||
                        window.mozRequestAnimationFrame ||
                        window.oRequestAnimationFrame ||
                        window.msRequestAnimationFrame ||
                        function(callback)
                        { window.setTimeout(callback, 1000.0/60.0); };
                })();
            window.requestAnimFrame(GameLoop);
        }
    };
}();

