import RPi.GPIO as GPIO
import paho.mqtt.client as mqtt
import sys
import os

BROKER = os.popen('hostname -I').readlines()[0].strip()

print(BROKER)

RED_pin = 10
GREEN_pin = 9
BLUE_pin = 11

RED_offset = 0
GREEN_offset = 1
BLUE_offset = 2

RED_COLOR = (255, 0, 0)
GREEN_COLOR = (0, 255, 0)
BLUE_COLOR = (0, 0, 255)

ERROR_COLOR = RED_COLOR


def on_connect(client, userdata, flags, rc):
	client.subscribe("doorbell/rgb/switch")
	client.subscribe("doorbell/rgb/color")
	
def on_message(client, userdata, msg):
	global led
	print(msg.topic + ": " + msg.payload.decode())
	if 'switch' in msg.topic:
		if "ON" in msg.payload.decode():
			led.turn_on()
		elif "OFF" in msg.payload.decode():
			led.turn_off()
		else:
			led.setColor(ERROR_COLOR)
	else:
		if '#' in msg.payload.decode() and len(msg.payload.decode()) < 8:
			r = int(msg.payload.decode()[1:3], base=16)
			g = int(msg.payload.decode()[3:5], base=16)
			b = int(msg.payload.decode()[5:], base=16)
			led.setColor((r, g, b))
		elif len(msg.payload.decode().split(',')) == 3:
			r,g,b = tuple(int(color_value) for color_value in msg.payload.decode().split(','))
			led.setColor((r,g,b))
		else:
			led.setColor(ERROR_COLOR)

def calculatePercents(raw_value):
	if raw_value > 0:
		return (1-raw_value/255)*100
	else:
		return 100
		
class RGB_LED:
	
	def __init__(self):
		# Creating reqired class elements
		self.prev_color = (0, 0, 0)
		self.current_color = (0, 0, 0)
		# Configuring PORTs
		GPIO.setwarnings(False)
		GPIO.setmode(GPIO.BCM)
		GPIO.setup(RED_pin, GPIO.OUT)
		GPIO.setup(GREEN_pin, GPIO.OUT)
		GPIO.setup(BLUE_pin, GPIO.OUT)
		# Set Soft PWM pins
		self.RED_pin_pwm = GPIO.PWM(RED_pin, 100)
		self.GREEN_pin_pwm = GPIO.PWM(GREEN_pin, 100)
		self.BLUE_pin_pwm = GPIO.PWM(BLUE_pin, 100)
		# Start PWMs
		self.RED_pin_pwm.start(100)
		self.GREEN_pin_pwm.start(100)
		self.BLUE_pin_pwm.start(100)
		

	def setColor(self, color):
		self.prev_color = self.current_color
		self.current_color = color
		self.RED_pin_pwm.ChangeDutyCycle(calculatePercents(color[RED_offset]))
		self.GREEN_pin_pwm.ChangeDutyCycle(calculatePercents(color[GREEN_offset]))
		self.BLUE_pin_pwm.ChangeDutyCycle(calculatePercents(color[BLUE_offset]))
		
	def turn_on(self):
		if self.current_color == (0, 0, 0):
			self.setColor(self.prev_color)

	def turn_off(self):
		if self.current_color != (0, 0, 0):
			self.setColor((0, 0, 0))

	def __del__(self):
		self.RED_pin_pwm.stop()
		self.GREEN_pin_pwm.stop()
		self.BLUE_pin_pwm.stop()
		GPIO.cleanup()

led = RGB_LED()
client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
	
client.connect(BROKER, 1883, 60)
try:
	client.loop_forever()
except KeyboardInterrupt:
	del led
except Exception as e:
	del led
	raise e
