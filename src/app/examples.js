/* The programs the gym ships with.

   These live here, and not in the Code tab that shows them, for one
   reason: the regression runs them. A program a child can pick off the
   menu and a program the test suite checks are the same text, so an
   example cannot quietly rot into something that no longer runs. If one
   of these breaks, `npm test` goes red before a class does.

   They are written the way MakeCode writes JavaScript, because that is
   what a child pastes in: `basic.forever(function () { ... })`, enums
   spelled out, no arrow functions, no `const`. */

export const EXAMPLES = {
  "Light chaser": `basic.forever(function () {
    if (bitbot.readLight(BBLightSensor.Left) > bitbot.readLight(BBLightSensor.Right)) {
        bitbot.rotate(BBRobotDirection.Left, 40)
    } else {
        bitbot.rotate(BBRobotDirection.Right, 40)
    }
    basic.pause(100)
})`,

  "Don't bump into things": `basic.forever(function () {
    let cm = bitbot.sonar(BBPingUnit.Centimeters)
    if (cm > 0 && cm < 20) {
        bitbot.rotate(BBRobotDirection.Right, 50)
        basic.pause(400)
    } else {
        bitbot.go(BBDirection.Forward, 50)
    }
    basic.pause(50)
})`,

  "Follow the line": `basic.forever(function () {
    let l = bitbot.readLine(BBLineSensor.Left)
    let r = bitbot.readLine(BBLineSensor.Right)
    if (l && !r) { bitbot.rotate(BBRobotDirection.Left, 35) }
    else if (r && !l) { bitbot.rotate(BBRobotDirection.Right, 35) }
    else { bitbot.go(BBDirection.Forward, 35) }
    basic.pause(20)
})`,

  "Say hello on the radio": `radio.setGroup(1)
radio.onReceivedNumber(function (n) {
    basic.showNumber(n)
})
input.onButtonPressed(Button.A, function () {
    radio.sendNumber(7)
})`,

  /* A child's own function, which is here because it is the shape that
     broke once: the source transform used to turn `function wiggle()`
     into `function await wiggle()` and kill any program that defined one. */
  "Wiggle dance": `function wiggle() {
    bitbot.rotate(BBRobotDirection.Left, 40)
    basic.pause(200)
    bitbot.rotate(BBRobotDirection.Right, 40)
    basic.pause(200)
}
basic.showIcon(IconNames.Happy)
for (let i = 0; i < 3; i++) {
    wiggle()
}
bitbot.stop(BBStopMode.Brake)
basic.showIcon(IconNames.Yes)`
};

/* Everything the Bit:Bot drawer can do, in one program, written the way a
   child would write it rather than called straight off the api object.

   That distinction is the whole point of it. `all-blocks.test.js` reaches
   into `api.bitbot.x()` directly, which never touches the source
   transform - and the transform is where the nastiest bug so far lived.
   This goes in as TEXT and comes out the other end of prepare(),
   compile() and the machine, which is the road a child's blocks actually
   travel. */
export const EVERY_BITBOT_BLOCK = `basic.showIcon(IconNames.Heart)

// the wheels, every way of asking
bitbot.go(BBDirection.Forward, 30)
basic.pause(100)
bitbot.goms(BBDirection.Forward, 30, 100)
bitbot.gocm(BBDirection.Forward, 30, 5)
bitbot.rotate(BBRobotDirection.Left, 30)
basic.pause(100)
bitbot.rotatems(BBRobotDirection.Right, 30, 100)
bitbot.spinDeg(BBRobotDirection.Left, 30, 45)
bitbot.steer(20, 30)
bitbot.arc(BBArcDirection.Left, 30, 200)
bitbot.arcdeg(BBArcDirection.Right, 30, 200, 45)
bitbot.move(BBMotor.Both, BBDirection.Forward, 30)
bitbot.movems(BBMotor.Left, BBDirection.Reverse, 30, 100)
bitbot.motor(BBMotor.Both, 300)
bitbot.drive(300)
bitbot.driveMilliseconds(300, 100)
bitbot.driveTurn(BBRobotDirection.Left, 300)
bitbot.driveTurnMilliseconds(BBRobotDirection.Right, 300, 100)
bitbot.stop(BBStopMode.Coast)
bitbot.stop(BBStopMode.Brake)

// the sensors
let eyeL = bitbot.readLight(BBLightSensor.Left)
let eyeR = bitbot.readLight(BBLightSensor.Right)
let lineL = bitbot.readLine(BBLineSensor.Left)
let lineA = bitbot.readLineAnalog(BBLineSensor.Right)
let cm = bitbot.sonar(BBPingUnit.Centimeters)
let inches = bitbot.sonar(BBPingUnit.Inches)
let us = bitbot.sonar(BBPingUnit.MicroSeconds)
let volts = bitbot.batteryVoltage()
let turned = bitbot.turnAngle(BBMotor.Left)
let ticks = bitbot.wheelSensor(BBMotor.Right)
bitbot.resetWheelSensors()

// the FireLeds
bitbot.setLedColor(BBColors.Red)
bitbot.setPixelColor(0, BBColors.Green)
bitbot.setLedColor(bitbot.BBColours(BBColors.Blue))
bitbot.ledRainbow()
bitbot.ledRotate()
bitbot.ledShift()
bitbot.ledBrightness(40)
bitbot.ledShow()
bitbot.ledClear()

// the buzzer and the trims
bitbot.buzz(1)
bitbot.buzz(0)
bitbot.buzzTime(50)
bitbot.setThreshold(BBLineSensor.Left, 400)
bitbot.BBBias(BBRobotDirection.Left, 5)

// what it says about itself
let model = bitbot.getModel()
let version = bitbot.getVersionCode()
let firmware = bitbot.getFirmwareCode()

basic.showIcon(IconNames.Yes)`;
