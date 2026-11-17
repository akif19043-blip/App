-- Ses çalar. Ses yüklenemezse oyun sessizce devam eder.

local SoundService = game:GetService("SoundService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Sounds = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Sounds"))

local Sfx = {}

local holder

local function makeSound(name, parent)
	local def = Sounds.Defs[name]
	if not def or def.id == "" then
		return nil
	end
	local sound = Instance.new("Sound")
	sound.SoundId = def.id
	sound.Volume = def.volume
	sound.PlaybackSpeed = def.speed
	sound.Parent = parent
	return sound, def
end

function Sfx.play2D(name, speedJitter)
	local sound = makeSound(name, SoundService)
	if not sound then
		return
	end
	if speedJitter then
		sound.PlaybackSpeed *= 1 + (math.random() - 0.5) * speedJitter
	end
	sound.Ended:Connect(function()
		sound:Destroy()
	end)
	sound:Play()
	task.delay(4, function()
		if sound.Parent then
			sound:Destroy()
		end
	end)
end

function Sfx.play3D(name, position, speedJitter)
	if not holder then
		holder = workspace.Terrain
	end
	local anchor = Instance.new("Attachment")
	anchor.WorldPosition = position
	anchor.Parent = holder
	local sound, def = makeSound(name, anchor)
	if not sound then
		anchor:Destroy()
		return
	end
	sound.RollOffMode = Enum.RollOffMode.InverseTapered
	sound.RollOffMinDistance = 10
	sound.RollOffMaxDistance = math.max(def.range, 20)
	if speedJitter then
		sound.PlaybackSpeed *= 1 + (math.random() - 0.5) * speedJitter
	end
	sound:Play()
	task.delay(4, function()
		anchor:Destroy()
	end)
end

return Sfx
