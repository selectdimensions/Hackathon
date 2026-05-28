# PiPod Stage-1 energy detector (gap E1). Target: Raspberry Pi 5 (Cortex-A76).
# Scaffold — links against librtlsdr/libhackrf/libfftw3; bodies are TODO stubs.

CC      ?= gcc
CFLAGS  ?= -O2 -mcpu=cortex-a76 -Wall -Wextra -std=c11
LDFLAGS ?=
LDLIBS  ?= -lrtlsdr -lhackrf -lfftw3f -lm -lpthread

SRCS := main.c stage1_energy.c stage2_trigger.c
OBJS := $(SRCS:.c=.o)
BIN  := pipod-detector

.PHONY: all clean
all: $(BIN)

$(BIN): $(OBJS)
	$(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(OBJS) $(LDLIBS)

%.o: %.c detector.h
	$(CC) $(CFLAGS) -c -o $@ $<

clean:
	rm -f $(OBJS) $(BIN)
