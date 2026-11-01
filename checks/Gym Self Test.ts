// Gym Self Test - drives every part of the gym once, in order.
// Watch the screen: each step shows something, so a step that is broken
// is the one where the screen stops changing.
let rest = 1

// 1. THE SCREEN AND THE BUZZER
basic.showString("GO")
basic.showIcon(IconNames.Heart)
music.play(music.tonePlayable(Note.C, music.beat(BeatFraction.Quarter)), music.PlaybackMode.UntilDone)

// 2. THE LIGHTS ON THE ARMS - red, then green, then off
bitbot.setLedColor(bitbot.BBColours(0xff0000))
basic.pause(rest * 1000)
bitbot.setLedColor(bitbot.BBColours(0x00ff00))
basic.pause(rest * 1000)
bitbot.ledClear()

// 3. THE WHEELS - forward, stop, spin right, stop
bitbot.go(BBDirection.Forward, 40)
basic.pause(rest * 1000)
bitbot.stop(BBStopMode.Brake)
bitbot.rotate(BBRobotDirection.Right, 40)
basic.pause(rest * 1000)
bitbot.stop(BBStopMode.Brake)

// 4. EVERY SENSOR, each one as a number on the screen
basic.showNumber(bitbot.sonar(BBPingUnit.Centimeters))
basic.showNumber(bitbot.readLight(BBLightSensor.Left))
basic.showNumber(bitbot.readLine(BBLineSensor.Left))
basic.showNumber(input.lightLevel())
basic.showNumber(input.soundLevel())
basic.showNumber(input.compassHeading())

// 5. THE RADIO - say hello to any other board on group 1
radio.setGroup(1)
radio.sendNumber(7)

// finished the sweep
basic.showIcon(IconNames.Yes)

// and the things you press, which the sweep cannot do for you
input.onButtonPressed(Button.A, function () {
    basic.showNumber(input.lightLevel())
})
input.onButtonPressed(Button.B, function () {
    bitbot.go(BBDirection.Reverse, 50)
    basic.pause(500)
    bitbot.stop(BBStopMode.Brake)
})
input.onLogoEvent(TouchButtonEvent.Pressed, function () {
    basic.showNumber(input.compassHeading())
})
input.onGesture(Gesture.Shake, function () {
    basic.showIcon(IconNames.Surprised)
})
radio.onReceivedNumber(function (receivedNumber) {
    basic.showNumber(receivedNumber)
})
